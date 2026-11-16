import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SyncRunStatus = "running" | "ok" | "error";
export type TokenSource = "gh" | "env";

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

export function openDatabase(databasePath: string): DatabaseSync {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);

  try {
    database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    migrate(database);
    markInterruptedRuns(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function getSyncStatus(database: DatabaseSync): SyncStatus {
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

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
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
