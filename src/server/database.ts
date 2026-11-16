import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { upsertSyncedPullRequests, type SyncedPullRequest } from "./items.js";

export type SyncRunStatus = "running" | "ok" | "error";
export type TokenSource = "gh" | "env";
export type GithubPrRole = "review" | "authored";

export interface GithubPr {
  id: number;
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  draft: boolean;
  updatedAt: string;
}

export interface GithubPrRecord extends GithubPr {
  role: GithubPrRole;
  nodeId: string;
  createdAt: string;
}

export interface GithubPrSearchResult {
  items: GithubPrRecord[];
  incomplete: boolean;
}

export interface SyncRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: SyncRunStatus;
  tokenSource: TokenSource | null;
  reviews: number;
  authored: number;
  incomplete: boolean;
  error: string | null;
}

export interface SyncStatus {
  running: boolean;
  last: SyncRun | null;
}

interface SyncRunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: SyncRunStatus;
  token_source: string | null;
  reviews_count: number;
  authored_count: number;
  incomplete: number;
  error: string | null;
}

interface RunningRow {
  running: number;
}

interface GithubPrRow {
  id: number;
  repo: string;
  number: number;
  title: string;
  html_url: string;
  author_login: string;
  draft: number;
  updated_at: string;
}

interface CountRow {
  count: number;
}

export function openDatabase(databasePath: string): DatabaseSync {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);

  try {
    database.exec("PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    migrate(database);
    markInterruptedRuns(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function getSyncStatus(database: DatabaseSync): SyncStatus {
  expireStaleRuns(database, new Date().toISOString());
  const runningRow = database
    .prepare("SELECT EXISTS(SELECT 1 FROM sync_runs WHERE status = 'running') AS running")
    .get() as RunningRow | undefined;
  const lastRow = database
    .prepare(
      `SELECT id, started_at, finished_at, status, token_source, reviews_count,
              authored_count, incomplete, error
       FROM sync_runs
       ORDER BY started_at DESC, rowid DESC
       LIMIT 1`,
    )
    .get() as SyncRunRow | undefined;

  return {
    running: Boolean(runningRow?.running),
    last: lastRow ? toSyncRun(lastRow) : null,
  };
}

export function getGithubPrs(database: DatabaseSync): { reviews: GithubPr[]; authored: GithubPr[] } {
  const readRole = (role: GithubPrRole): GithubPr[] => {
    const rows = database
      .prepare(
        `SELECT id, repo, number, title, html_url, author_login, draft, updated_at
         FROM github_prs
         WHERE role = ?
         ORDER BY updated_at DESC, number DESC`,
      )
      .all(role) as GithubPrRow[];

    return rows.map((row) => ({
      id: row.id,
      repo: row.repo,
      number: row.number,
      title: row.title,
      url: row.html_url,
      author: row.author_login,
      draft: row.draft !== 0,
      updatedAt: row.updated_at,
    }));
  };

  return { reviews: readRole("review"), authored: readRole("authored") };
}

const staleRunMs = 5 * 60 * 1000;

function expireStaleRuns(database: DatabaseSync, now: string): void {
  database
    .prepare(
      `UPDATE sync_runs
       SET status = 'error', finished_at = ?, error = ?
       WHERE status = 'running' AND started_at < ?`,
    )
    .run(
      now,
      "Execução anterior interrompida antes da conclusão.",
      new Date(Date.parse(now) - staleRunMs).toISOString(),
    );
}

export function startSyncRun(database: DatabaseSync, id: string, startedAt: string): boolean {
  database.exec("BEGIN IMMEDIATE");

  try {
    expireStaleRuns(database, startedAt);

    const activeRun = database
      .prepare("SELECT 1 AS running FROM sync_runs WHERE status = 'running' LIMIT 1")
      .get() as RunningRow | undefined;

    if (activeRun) {
      database.exec("COMMIT");
      return false;
    }

    database
      .prepare("INSERT INTO sync_runs (id, started_at, status) VALUES (?, ?, 'running')")
      .run(id, startedAt);
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function setSyncRunTokenSource(database: DatabaseSync, id: string, source: TokenSource): void {
  database.prepare("UPDATE sync_runs SET token_source = ? WHERE id = ?").run(source, id);
}

export function failSyncRun(database: DatabaseSync, id: string, finishedAt: string, message: string): void {
  database
    .prepare("UPDATE sync_runs SET status = 'error', finished_at = ?, error = ? WHERE id = ?")
    .run(finishedAt, message, id);
}

export function completeGithubSync(
  database: DatabaseSync,
  id: string,
  reviews: GithubPrSearchResult,
  authored: GithubPrSearchResult,
  finishedAt: string,
): void {
  database.exec("BEGIN IMMEDIATE");

  try {
    const replaceRole = (role: GithubPrRole, result: GithubPrSearchResult): void => {
      if (result.incomplete) return;

      database.prepare("DELETE FROM github_prs WHERE role = ?").run(role);
      const insert = database.prepare(
        `INSERT INTO github_prs (
           id, role, node_id, repo, number, title, html_url, author_login,
           draft, created_at, updated_at, synced_run_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const item of result.items) {
        insert.run(
          item.id,
          role,
          item.nodeId,
          item.repo,
          item.number,
          item.title,
          item.url,
          item.author,
          item.draft ? 1 : 0,
          item.createdAt,
          item.updatedAt,
          id,
        );
      }
    };

    replaceRole("review", reviews);
    replaceRole("authored", authored);

    upsertSyncedPullRequests(database, readSyncedPullRequests(database), finishedAt);

    const countRole = (role: GithubPrRole): number => {
      const row = database
        .prepare("SELECT COUNT(*) AS count FROM github_prs WHERE role = ?")
        .get(role) as CountRow | undefined;
      return row?.count ?? 0;
    };

    database
      .prepare(
        `UPDATE sync_runs
         SET status = 'ok', finished_at = ?, reviews_count = ?, authored_count = ?,
             incomplete = ?, error = NULL
         WHERE id = ?`,
      )
      .run(finishedAt, countRole("review"), countRole("authored"), Number(reviews.incomplete || authored.incomplete), id);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function migrate(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");

  try {
    database.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version INTEGER PRIMARY KEY,
         applied_at TEXT NOT NULL
       )`,
    );

    const currentMigration = database
      .prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get(1);

    if (!currentMigration) {
      database.exec(
        `CREATE TABLE IF NOT EXISTS sync_runs (
           id TEXT PRIMARY KEY NOT NULL,
           started_at TEXT NOT NULL,
           finished_at TEXT,
           status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error')),
           token_source TEXT CHECK (token_source IN ('gh', 'env') OR token_source IS NULL),
           reviews_count INTEGER NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
           authored_count INTEGER NOT NULL DEFAULT 0 CHECK (authored_count >= 0),
           incomplete INTEGER NOT NULL DEFAULT 0 CHECK (incomplete IN (0, 1)),
           error TEXT
         )`,
      );
      database
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(1, new Date().toISOString());
    }

    const briefingsMigration = database
      .prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get(2);

    if (!briefingsMigration) {
      database.exec(
        `CREATE TABLE IF NOT EXISTS briefings (
           id TEXT PRIMARY KEY NOT NULL,
           date TEXT NOT NULL UNIQUE,
           agent TEXT NOT NULL,
           headline TEXT NOT NULL,
           payload_json TEXT NOT NULL,
           received_at TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS sync_events (
           id TEXT PRIMARY KEY NOT NULL,
           kind TEXT NOT NULL,
           occurred_at TEXT NOT NULL,
           detail_json TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS sync_events_occurred_at ON sync_events (occurred_at)`,
      );
      database
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(2, new Date().toISOString());
    }

    const githubPrsMigration = database
      .prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get(3);

    if (!githubPrsMigration) {
      database.exec(
        `CREATE TABLE IF NOT EXISTS github_prs (
           id INTEGER NOT NULL,
           role TEXT NOT NULL CHECK (role IN ('review', 'authored')),
           node_id TEXT NOT NULL,
           repo TEXT NOT NULL,
           number INTEGER NOT NULL CHECK (number > 0),
           title TEXT NOT NULL,
           html_url TEXT NOT NULL,
           author_login TEXT NOT NULL,
           draft INTEGER NOT NULL CHECK (draft IN (0, 1)),
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL,
           synced_run_id TEXT NOT NULL REFERENCES sync_runs(id),
           PRIMARY KEY (id, role)
         )`,
      );
      database
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(3, new Date().toISOString());
    }

    const itemsMigration = database
      .prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get(4);

    if (!itemsMigration) {
      database.exec(
        `CREATE TABLE IF NOT EXISTS items (
           id TEXT PRIMARY KEY NOT NULL,
           source TEXT NOT NULL,
           kind TEXT NOT NULL,
           external_id TEXT NOT NULL,
           title TEXT NOT NULL,
           url TEXT,
           summary TEXT,
           updated_at TEXT,
           origin TEXT NOT NULL CHECK (origin IN ('sync', 'agent')),
           received_at TEXT NOT NULL,
           agent_touched_at TEXT,
           UNIQUE (source, external_id)
         );
         CREATE INDEX IF NOT EXISTS items_agent_touched_at ON items (agent_touched_at)`,
      );
      const appliedAt = new Date().toISOString();
      upsertSyncedPullRequests(database, readSyncedPullRequests(database), appliedAt);
      database
        .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
        .run(4, appliedAt);
    }

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function readSyncedPullRequests(database: DatabaseSync): SyncedPullRequest[] {
  return database
    .prepare(
      `SELECT repo, number, title, html_url AS url, updated_at AS updatedAt
       FROM github_prs
       ORDER BY updated_at DESC, number DESC`,
    )
    .all() as unknown as SyncedPullRequest[];
}

function markInterruptedRuns(database: DatabaseSync): void {
  database
    .prepare(
      `UPDATE sync_runs
       SET status = 'error', finished_at = ?, error = ?
       WHERE status = 'running'`,
    )
    .run(new Date().toISOString(), "Execução anterior interrompida antes da conclusão.");
}

function toSyncRun(row: SyncRunRow): SyncRun {
  const tokenSource: TokenSource | null =
    row.token_source === "gh" || row.token_source === "env" ? row.token_source : null;

  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    tokenSource,
    reviews: row.reviews_count,
    authored: row.authored_count,
    incomplete: row.incomplete !== 0,
    error: row.error,
  };
}
