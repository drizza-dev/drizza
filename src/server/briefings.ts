import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface BriefingLink {
  url: string;
  label: string;
  source: "slack" | "github" | "other";
}

export interface BriefingItemRef {
  source: string;
  external_id: string;
}

export interface BriefingBullet {
  text: string;
  links?: BriefingLink[];
  item_refs?: BriefingItemRef[];
}

export interface BriefingSection {
  title: string;
  bullets: BriefingBullet[];
}

export interface BriefingInput {
  contract_version: "1";
  date: string;
  agent: string;
  headline: string;
  sections: BriefingSection[];
}

export interface PushBriefingResult {
  briefing_id: string;
  date: string;
  replaced: boolean;
}

interface BriefingIdRow {
  id: string;
}

export function pushBriefing(database: DatabaseSync, input: BriefingInput): PushBriefingResult {
  const receivedAt = new Date().toISOString();
  const payload = JSON.stringify({
    contract_version: input.contract_version,
    date: input.date,
    agent: input.agent,
    headline: input.headline,
    sections: input.sections,
  });

  database.exec("BEGIN IMMEDIATE");

  try {
    const existing = database.prepare("SELECT id FROM briefings WHERE date = ?").get(input.date) as
      | BriefingIdRow
      | undefined;
    const briefingId = existing?.id ?? randomUUID();

    if (existing) {
      database
        .prepare("UPDATE briefings SET agent = ?, headline = ?, payload_json = ?, received_at = ? WHERE id = ?")
        .run(input.agent, input.headline, payload, receivedAt, briefingId);
    } else {
      database
        .prepare(
          "INSERT INTO briefings (id, date, agent, headline, payload_json, received_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(briefingId, input.date, input.agent, input.headline, payload, receivedAt);
    }

    const result: PushBriefingResult = { briefing_id: briefingId, date: input.date, replaced: Boolean(existing) };

    database
      .prepare("INSERT INTO sync_events (id, kind, occurred_at, detail_json) VALUES (?, ?, ?, ?)")
      .run(
        randomUUID(),
        "briefing_received",
        receivedAt,
        JSON.stringify({ briefing_id: briefingId, date: input.date, agent: input.agent, replaced: result.replaced }),
      );

    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export interface StoredBriefing {
  briefing_id: string;
  date: string;
  agent: string;
  headline: string;
  sections: BriefingSection[];
  received_at: string;
}

interface BriefingRow {
  id: string;
  date: string;
  agent: string;
  headline: string;
  payload_json: string;
  received_at: string;
}

export function getBriefing(database: DatabaseSync, date: string): StoredBriefing | null {
  const row = database
    .prepare("SELECT id, date, agent, headline, payload_json, received_at FROM briefings WHERE date = ?")
    .get(date) as BriefingRow | undefined;

  if (!row) return null;

  const payload = JSON.parse(row.payload_json) as { sections?: BriefingSection[] };

  return {
    briefing_id: row.id,
    date: row.date,
    agent: row.agent,
    headline: row.headline,
    sections: payload.sections ?? [],
    received_at: row.received_at,
  };
}

export function localToday(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
