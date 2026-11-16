import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type ItemOrigin = "sync" | "agent";

export interface ItemInput {
  source: string;
  kind: string;
  external_id: string;
  title: string;
  url?: string;
  summary?: string;
  updated_at?: string;
}

export interface PushItemsInput {
  contract_version: "1";
  items: ItemInput[];
}

export interface PushItemsResult {
  inserted: number;
  updated: number;
}

export interface StoredItem {
  source: string;
  kind: string;
  external_id: string;
  origin: ItemOrigin;
  title: string;
  url?: string;
  summary?: string;
  updated_at?: string;
  received_at: string;
}

export interface SyncedPullRequest {
  repo: string;
  number: number;
  title: string;
  url: string;
  updatedAt: string;
}

interface ItemOriginRow {
  origin: ItemOrigin;
}

interface ItemRow {
  source: string;
  kind: string;
  external_id: string;
  origin: ItemOrigin;
  title: string;
  url: string | null;
  summary: string | null;
  updated_at: string | null;
  received_at: string;
}

export const githubPullRequestSource = "github";
export const githubPullRequestKind = "pull_request";
const maxItemsPerDay = 200;

export function githubPullRequestExternalId(repo: string, number: number): string {
  return `${repo}#${number}`.toLowerCase();
}

function itemKey(source: string, externalId: string): { source: string; externalId: string } {
  return source === githubPullRequestSource
    ? { source, externalId: externalId.toLowerCase() }
    : { source, externalId };
}

function normalizeUrl(value: string | undefined): string | null {
  return value === undefined ? null : new URL(value).href;
}

export function pushItems(database: DatabaseSync, input: PushItemsInput): PushItemsResult {
  const receivedAt = new Date().toISOString();
  const result: PushItemsResult = { inserted: 0, updated: 0 };

  database.exec("BEGIN IMMEDIATE");

  try {
    const findOrigin = database.prepare("SELECT origin FROM items WHERE source = ? AND external_id = ?");
    const insert = database.prepare(
      `INSERT INTO items (
         id, source, kind, external_id, title, url, summary, updated_at, origin, received_at, agent_touched_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agent', ?, ?)`,
    );
    const enrichSynced = database.prepare(
      `UPDATE items SET summary = COALESCE(?, summary), received_at = ?, agent_touched_at = ?
       WHERE source = ? AND external_id = ?`,
    );
    const mergeAgent = database.prepare(
      `UPDATE items SET
         kind = ?,
         title = ?,
         url = COALESCE(?, url),
         summary = COALESCE(?, summary),
         updated_at = COALESCE(?, updated_at),
         received_at = ?,
         agent_touched_at = ?
       WHERE source = ? AND external_id = ?`,
    );

    for (const item of input.items) {
      const { source, externalId } = itemKey(item.source, item.external_id);
      const existing = findOrigin.get(source, externalId) as ItemOriginRow | undefined;
      const url = normalizeUrl(item.url);
      const summary = item.summary ?? null;
      const updatedAt = item.updated_at ?? null;

      if (!existing) {
        insert.run(randomUUID(), source, item.kind, externalId, item.title, url, summary, updatedAt, receivedAt, receivedAt);
        result.inserted += 1;
      } else if (existing.origin === "sync") {
        enrichSynced.run(summary, receivedAt, receivedAt, source, externalId);
        result.updated += 1;
      } else {
        mergeAgent.run(item.kind, item.title, url, summary, updatedAt, receivedAt, receivedAt, source, externalId);
        result.updated += 1;
      }
    }

    database
      .prepare("INSERT INTO sync_events (id, kind, occurred_at, detail_json) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), "items_received", receivedAt, JSON.stringify(result));

    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function upsertSyncedPullRequests(
  database: DatabaseSync,
  pullRequests: SyncedPullRequest[],
  receivedAt: string,
): void {
  const upsert = database.prepare(
    `INSERT INTO items (id, source, kind, external_id, title, url, summary, updated_at, origin, received_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'sync', ?)
     ON CONFLICT (source, external_id) DO UPDATE SET
       kind = excluded.kind,
       title = excluded.title,
       url = excluded.url,
       updated_at = excluded.updated_at,
       origin = 'sync',
       received_at = excluded.received_at`,
  );
  const keep = new Set<string>();

  for (const pullRequest of pullRequests) {
    const externalId = githubPullRequestExternalId(pullRequest.repo, pullRequest.number);
    if (keep.has(externalId)) continue;
    keep.add(externalId);
    upsert.run(
      randomUUID(),
      githubPullRequestSource,
      githubPullRequestKind,
      externalId,
      pullRequest.title,
      pullRequest.url,
      pullRequest.updatedAt,
      receivedAt,
    );
  }

  const synced = database
    .prepare("SELECT external_id FROM items WHERE origin = 'sync' AND source = ? AND kind = ?")
    .all(githubPullRequestSource, githubPullRequestKind) as Array<{ external_id: string }>;
  const release = database.prepare(
    `UPDATE items SET origin = 'agent'
     WHERE origin = 'sync' AND source = ? AND external_id = ?
       AND (summary IS NOT NULL OR agent_touched_at IS NOT NULL)`,
  );
  const remove = database.prepare(
    `DELETE FROM items
     WHERE origin = 'sync' AND source = ? AND external_id = ?
       AND summary IS NULL AND agent_touched_at IS NULL`,
  );

  for (const row of synced) {
    if (keep.has(row.external_id)) continue;
    release.run(githubPullRequestSource, row.external_id);
    remove.run(githubPullRequestSource, row.external_id);
  }
}

export function getItemsForDay(database: DatabaseSync, date: string): StoredItem[] {
  const [year, month, day] = date.split("-").map(Number);
  const start = new Date(year, month - 1, day).toISOString();
  const end = new Date(year, month - 1, day + 1).toISOString();
  const rows = database
    .prepare(
      `SELECT source, kind, external_id, origin, title, url, summary, updated_at, received_at
       FROM items
       WHERE agent_touched_at >= ? AND agent_touched_at < ?
       ORDER BY agent_touched_at DESC, rowid DESC
       LIMIT ?`,
    )
    .all(start, end, maxItemsPerDay) as unknown as ItemRow[];

  return rows.map((row) => {
    const item: StoredItem = {
      source: row.source,
      kind: row.kind,
      external_id: row.external_id,
      origin: row.origin,
      title: row.title,
      received_at: row.received_at,
    };
    if (row.url !== null) item.url = row.url;
    if (row.summary !== null) item.summary = row.summary;
    if (row.updated_at !== null) item.updated_at = row.updated_at;
    return item;
  });
}
