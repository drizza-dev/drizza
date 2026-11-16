import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getBriefing, localToday } from "./briefings.js";
import { getGithubPrs, getSyncStatus } from "./database.js";
import { runGithubSync, startGithubSync } from "./github-sync.js";
import { handleMcpRequest, type McpOptions, type McpReply } from "./mcp.js";

interface ServerOptions {
  database: DatabaseSync;
  distDirectory: string;
  port: number;
  mcp: McpOptions;
}

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const responseHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function createDrizzaServer(options: ServerOptions): Server {
  const distRoot = resolve(options.distDirectory);

  return createServer((request, response) => {
    void handleRequest(request, response, options, distRoot).catch(() => {
      if (response.headersSent) {
        response.destroy();
        return;
      }

      sendJson(response, 500, { error: "internal_server_error" }, request.method === "HEAD");
    });
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ServerOptions,
  distRoot: string,
): Promise<void> {
  const method = request.method ?? "GET";
  const expectedOrigin = allowedOrigin(request.headers.host, options.port);

  if (!expectedOrigin) {
    sendJson(response, 403, { error: "invalid_host" }, method === "HEAD");
    return;
  }

  if (isMcpPath(request.url)) {
    if (request.headers.origin !== undefined && !isAllowedOrigin(request.headers.origin, expectedOrigin)) {
      sendJson(response, 403, { error: "invalid_origin" }, method === "HEAD");
      return;
    }

    sendMcpReply(response, await handleMcpRequest(request, options.mcp, options.database), method === "HEAD");
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    if (!isAllowedOrigin(request.headers.origin, expectedOrigin)) {
      sendJson(response, 403, { error: "invalid_origin" });
      return;
    }

    let writePath: string | null = null;

    try {
      writePath = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    } catch {}

    if (method !== "POST" || writePath !== "/api/sync/github") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    request.resume();
  }

  let pathname: string;

  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  } catch {
    sendJson(response, 400, { error: "invalid_path" }, method === "HEAD");
    return;
  }

  if (pathname === "/api/sync/status") {
    sendJson(response, 200, getSyncStatus(options.database), method === "HEAD");
    return;
  }

  if (pathname === "/api/github/prs") {
    sendJson(
      response,
      200,
      { ...getGithubPrs(options.database), lastSync: getSyncStatus(options.database).last },
      method === "HEAD",
    );
    return;
  }

  if (pathname === "/api/briefing/today") {
    const date = localToday();
    sendJson(response, 200, { date, briefing: getBriefing(options.database, date) }, method === "HEAD");
    return;
  }

  if (pathname === "/api/sync/github") {
    if (method !== "POST") {
      sendJson(response, 405, { error: "method_not_allowed" }, method === "HEAD");
      return;
    }

    const result = startGithubSync(options.database);

    if (result.kind === "in_progress") {
      sendJson(response, 409, { error: "sync_in_progress" });
      return;
    }

    if (result.kind === "no_token") {
      sendJson(response, 401, { error: "no_token", hint: result.hint });
      return;
    }

    if (result.kind === "error") {
      sendJson(response, 500, { error: "internal_server_error" });
      return;
    }

    sendJson(response, 202, { runId: result.runId });
    void runGithubSync(options.database, result.runId, result.token).catch(() => undefined);
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "not_found" }, method === "HEAD");
    return;
  }

  await serveStaticFile(response, distRoot, pathname, method === "HEAD");
}

async function serveStaticFile(
  response: ServerResponse,
  distRoot: string,
  pathname: string,
  headOnly: boolean,
): Promise<void> {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(distRoot, relativePath);

  if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${sep}`)) {
    sendJson(response, 403, { error: "invalid_path" }, headOnly);
    return;
  }

  let file: Buffer;

  try {
    file = await readFile(filePath);
  } catch {
    sendJson(response, 404, { error: "not_found" }, headOnly);
    return;
  }

  const contentType = contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  response.writeHead(200, {
    ...responseHeaders,
    "Cache-Control": "no-store",
    "Content-Length": String(file.byteLength),
    "Content-Type": contentType,
  });

  if (headOnly) {
    response.end();
    return;
  }

  response.end(file);
}

function isMcpPath(url: string | undefined): boolean {
  try {
    return new URL(url ?? "/", "http://127.0.0.1").pathname === "/mcp";
  } catch {
    return false;
  }
}

function sendMcpReply(response: ServerResponse, reply: McpReply, headOnly: boolean): void {
  if (reply.payload === undefined) {
    response.writeHead(reply.status, {
      ...responseHeaders,
      ...reply.headers,
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }

  sendJson(response, reply.status, reply.payload, headOnly, reply.headers);
}

function allowedOrigin(hostHeader: string | undefined, port: number): string | null {
  if (!hostHeader) return null;

  try {
    const host = new URL(`http://${hostHeader}`);
    const hostname = host.hostname.toLowerCase();
    const hostPort = host.port ? Number(host.port) : 80;

    if (
      host.username ||
      host.password ||
      host.pathname !== "/" ||
      host.search ||
      host.hash ||
      (hostname !== "127.0.0.1" && hostname !== "localhost") ||
      hostPort !== port
    ) {
      return null;
    }

    return host.origin;
  } catch {
    return null;
  }
}

function isAllowedOrigin(originHeader: string | undefined, expectedOrigin: string): boolean {
  if (!originHeader) return false;

  try {
    const origin = new URL(originHeader);
    return (
      origin.protocol === "http:" &&
      origin.origin === expectedOrigin &&
      !origin.username &&
      !origin.password &&
      origin.pathname === "/" &&
      !origin.search &&
      !origin.hash
    );
  } catch {
    return false;
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  headOnly = false,
  extraHeaders: Record<string, string> = {},
): void {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, {
    ...responseHeaders,
    ...extraHeaders,
    "Cache-Control": "no-store",
    "Content-Length": String(body.byteLength),
    "Content-Type": "application/json; charset=utf-8",
  });

  if (headOnly) {
    response.end();
    return;
  }

  response.end(body);
}
