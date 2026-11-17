import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  completeGithubSync,
  failSyncRun,
  setSyncRunTokenSource,
  startSyncRun,
  type GithubPrRecord,
  type GithubPrRole,
  type GithubPrSearchResult,
  type TokenSource,
} from "./database.js";

interface GithubToken {
  value: string;
  source: TokenSource;
}

interface TokenResolution {
  token: GithubToken | null;
  keychainFailure: boolean;
  ghUnavailable: boolean;
}

interface GithubSearchItem {
  id?: unknown;
  node_id?: unknown;
  number?: unknown;
  title?: unknown;
  html_url?: unknown;
  repository_url?: unknown;
  user?: { login?: unknown } | null;
  draft?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  pull_request?: unknown;
}

interface GithubSearchResponse {
  total_count?: unknown;
  incomplete_results?: unknown;
  items?: unknown;
}

class GithubSyncError extends Error {}

export type StartGithubSyncResult =
  | { kind: "in_progress" }
  | { kind: "no_token"; hint: string }
  | { kind: "error" }
  | { kind: "started"; runId: string; token: string };

const searchPageSize = 100;
const searchResultLimit = 1000;

const queries: Record<GithubPrRole, string> = {
  review: "is:pr is:open archived:false review-requested:@me",
  authored: "is:pr is:open archived:false author:@me",
};

export function startGithubSync(database: DatabaseSync): StartGithubSyncResult {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  if (!startSyncRun(database, runId, startedAt)) {
    return { kind: "in_progress" };
  }

  let resolution: TokenResolution;

  try {
    resolution = resolveGithubToken();
  } catch {
    try {
      failSyncRun(database, runId, new Date().toISOString(), "Não foi possível iniciar a sincronização.");
    } catch {}
    return { kind: "error" };
  }

  if (!resolution.token) {
    try {
      failSyncRun(database, runId, new Date().toISOString(), "Token do GitHub não encontrado.");
    } catch {}

    return { kind: "no_token", hint: missingTokenHint(resolution) };
  }

  try {
    setSyncRunTokenSource(database, runId, resolution.token.source);
  } catch {
    try {
      failSyncRun(database, runId, new Date().toISOString(), "Não foi possível iniciar a sincronização.");
    } catch {}
    return { kind: "error" };
  }

  return { kind: "started", runId, token: resolution.token.value };
}

export async function runGithubSync(database: DatabaseSync, runId: string, token: string): Promise<void> {
  try {
    const reviews = await searchPullRequests(token, "review");
    const authored = await searchPullRequests(token, "authored");
    completeGithubSync(database, runId, reviews, authored, new Date().toISOString());
  } catch (error) {
    const message = error instanceof GithubSyncError
      ? error.message
      : "Não foi possível conectar ao GitHub. Confira sua conexão e tente novamente.";

    try {
      failSyncRun(database, runId, new Date().toISOString(), message);
    } catch {}
  }
}

function resolveGithubToken(): TokenResolution {
  const ghResult = spawnSync("gh", ["auth", "token"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
    windowsHide: true,
  });
  const ghToken = typeof ghResult.stdout === "string" ? ghResult.stdout.trim() : "";

  if (ghResult.status === 0 && ghToken) {
    return { token: { value: ghToken, source: "gh" }, keychainFailure: false, ghUnavailable: false };
  }

  const keychainFailure = /keychain/i.test(typeof ghResult.stderr === "string" ? ghResult.stderr : "");
  const ghUnavailable = (ghResult.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
  const environmentToken = process.env.DRIZZA_GITHUB_TOKEN?.trim();

  if (environmentToken) {
    return {
      token: { value: environmentToken, source: "env" },
      keychainFailure,
      ghUnavailable,
    };
  }

  return { token: null, keychainFailure, ghUnavailable };
}

function missingTokenHint(resolution: TokenResolution): string {
  if (resolution.keychainFailure) {
    return "O gh não conseguiu acessar o keychain nesta sessão. Execute `gh auth login --insecure-storage` ou defina DRIZZA_GITHUB_TOKEN com um PAT fine-grained.";
  }

  if (resolution.ghUnavailable) {
    return "Defina DRIZZA_GITHUB_TOKEN com um PAT fine-grained ou instale e autentique o GitHub CLI.";
  }

  return "Autentique o GitHub CLI com `gh auth login` ou defina DRIZZA_GITHUB_TOKEN com um PAT fine-grained.";
}

interface GithubSearchPage {
  items: GithubPrRecord[];
  incomplete: boolean;
  totalCount: number;
  pageLength: number;
}

async function searchPullRequests(token: string, role: GithubPrRole): Promise<GithubPrSearchResult> {
  const byId = new Map<number, GithubPrRecord>();
  let incomplete = false;

  for (let page = 1; page * searchPageSize <= searchResultLimit; page += 1) {
    const result = await searchPullRequestPage(token, role, page);
    for (const item of result.items) byId.set(item.id, item);
    incomplete ||= result.incomplete || result.totalCount > searchResultLimit;
    if (result.pageLength < searchPageSize || page * searchPageSize >= result.totalCount) break;
  }

  return { items: [...byId.values()], incomplete };
}

async function searchPullRequestPage(token: string, role: GithubPrRole, page: number): Promise<GithubSearchPage> {
  const url = new URL("https://api.github.com/search/issues");
  url.searchParams.set("q", queries[role]);
  url.searchParams.set("per_page", String(searchPageSize));
  url.searchParams.set("page", String(page));

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "drizza",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new GithubSyncError("Não foi possível conectar ao GitHub. Confira sua conexão e tente novamente.");
  }

  if (!response.ok) {
    const rateLimited = (response.status === 403 || response.status === 429)
      && (response.headers.has("retry-after") || response.headers.has("x-ratelimit-reset"));

    if (rateLimited) {
      throw new GithubSyncError(rateLimitMessage(response.headers));
    }

    if (response.status === 401) {
      throw new GithubSyncError("O GitHub recusou o token. Confira a autenticação e as permissões de leitura.");
    }

    if (response.status === 403) {
      throw new GithubSyncError("O GitHub recusou a busca. Confira as permissões de leitura do token.");
    }

    throw new GithubSyncError("O GitHub não concluiu a busca. Tente novamente mais tarde.");
  }

  let payload: GithubSearchResponse;

  try {
    payload = await response.json() as GithubSearchResponse;
  } catch {
    throw new GithubSyncError("O GitHub retornou uma resposta inválida. Tente novamente.");
  }

  if (
    typeof payload.incomplete_results !== "boolean"
    || !Array.isArray(payload.items)
    || !Number.isSafeInteger(payload.total_count)
  ) {
    throw new GithubSyncError("O GitHub retornou uma resposta inválida. Tente novamente.");
  }

  const items: GithubPrRecord[] = [];
  for (const item of payload.items) {
    const record = toGithubPrRecord(item as GithubSearchItem, role);
    if (!record) throw new GithubSyncError("O GitHub retornou uma resposta inválida. Tente novamente.");
    items.push(record);
  }

  return {
    items,
    incomplete: payload.incomplete_results === true,
    totalCount: payload.total_count as number,
    pageLength: payload.items.length,
  };
}

function toGithubPrRecord(item: GithubSearchItem, role: GithubPrRole): GithubPrRecord | null {
  if (
    !Number.isSafeInteger(item.id) ||
    !Number.isSafeInteger(item.number) ||
    typeof item.title !== "string" ||
    typeof item.html_url !== "string" ||
    typeof item.repository_url !== "string" ||
    typeof item.updated_at !== "string" ||
    !item.pull_request
  ) {
    return null;
  }

  const repo = parseRepository(item.repository_url);
  if (!repo) return null;

  const id = item.id as number;
  const updatedAt = item.updated_at;

  return {
    id,
    role,
    nodeId: typeof item.node_id === "string" ? item.node_id : String(id),
    repo,
    number: item.number as number,
    title: item.title,
    url: item.html_url,
    author: typeof item.user?.login === "string" ? item.user.login : "unknown",
    draft: item.draft === true,
    createdAt: typeof item.created_at === "string" ? item.created_at : updatedAt,
    updatedAt,
  };
}

function parseRepository(value: string): string | null {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);

    if (
      url.protocol !== "https:" ||
      url.hostname !== "api.github.com" ||
      parts.length !== 3 ||
      parts[0] !== "repos"
    ) {
      return null;
    }

    return `${parts[1]}/${parts[2]}`;
  } catch {
    return null;
  }
}

function rateLimitMessage(headers: Headers): string {
  const resetAt = rateLimitResetTime(headers);
  if (!resetAt) return "O limite de buscas do GitHub foi atingido. Tente novamente mais tarde.";

  return `O limite de buscas do GitHub foi atingido. Tente novamente após ${new Date(resetAt).toLocaleString("pt-BR")}.`;
}

function rateLimitResetTime(headers: Headers): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return Date.now() + Number(retryAfter) * 1000;

  if (retryAfter) {
    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) return retryDate;
  }

  const resetHeader = headers.get("x-ratelimit-reset");
  if (resetHeader && /^\d+$/.test(resetHeader)) {
    const resetAt = Number(resetHeader) * 1000;
    if (Number.isFinite(resetAt)) return resetAt;
  }

  return null;
}
