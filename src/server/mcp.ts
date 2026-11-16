import type { IncomingMessage } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { pushBriefing, type BriefingInput } from "./briefings.js";
import { compileSchema, type SchemaIssue, type SchemaValidator } from "./json-schema.js";
import contract from "./mcp-contract-v1.json" with { type: "json" };
import { bearerMatches } from "./mcp-token.js";

export interface McpOptions {
  token: string;
  serverVersion: string;
}

export interface McpReply {
  status: number;
  payload?: unknown;
  headers?: Record<string, string>;
}

type JsonRpcId = string | number;
type JsonObject = Record<string, unknown>;

const modernVersion = "2026-07-28";
const legacyVersions = ["2025-11-25", "2025-06-18", "2025-03-26"];
const supportedVersions = [modernVersion, ...legacyVersions];
const maxBodyBytes = 1024 * 1024;
const toolNames = new Set(contract.tools.map((tool) => tool.name));
const contractMeta = { "dev.drizza/contract_version": contract.contract_version };
const maxReportedIssues = 20;
const inputValidators = new Map<string, SchemaValidator>(
  (contract.tools as Array<{ name: string; inputSchema: unknown }>).map((tool) => [
    tool.name,
    compileSchema(tool.inputSchema),
  ]),
);

export async function handleMcpRequest(
  request: IncomingMessage,
  options: McpOptions,
  database: DatabaseSync,
): Promise<McpReply> {
  if (request.method !== "POST") {
    return { status: 405, payload: { error: "method_not_allowed" }, headers: { Allow: "POST" } };
  }

  if (!bearerMatches(request.headers.authorization, options.token)) {
    return { status: 401, payload: { error: "unauthorized" }, headers: { "WWW-Authenticate": "Bearer" } };
  }

  const contentType = (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();

  if (contentType !== "application/json") {
    return { status: 415, payload: { error: "unsupported_media_type" } };
  }

  const body = await readBody(request);

  if (!body) {
    return { status: 413, payload: { error: "payload_too_large" } };
  }

  let message: unknown;

  try {
    message = JSON.parse(body.toString("utf8"));
  } catch {
    return rpcError(400, null, -32700, "Parse error");
  }

  if (!isObject(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(400, null, -32600, "Invalid Request");
  }

  if (!("id" in message)) {
    return { status: 202 };
  }

  const id = message.id;

  if (typeof id !== "string" && typeof id !== "number") {
    return rpcError(400, null, -32600, "Invalid Request");
  }

  if (message.params !== undefined && !isObject(message.params)) {
    return rpcError(400, id, -32602, "Invalid params");
  }

  const method = message.method;
  const params = message.params ?? {};
  const meta = isObject(params._meta) ? params._meta : undefined;
  const metaVersion = meta?.["io.modelcontextprotocol/protocolVersion"];

  if (metaVersion === undefined) {
    if (singleHeader(request, "mcp-protocol-version") === modernVersion) {
      return rpcError(400, id, -32602, "Invalid params: missing required _meta fields");
    }

    return handleLegacy(request, id, method, params, options, database);
  }

  return handleModern(request, id, method, params, meta ?? {}, metaVersion, options, database);
}

function handleLegacy(
  request: IncomingMessage,
  id: JsonRpcId,
  method: string,
  params: JsonObject,
  options: McpOptions,
  database: DatabaseSync,
): McpReply {
  const headerVersion = singleHeader(request, "mcp-protocol-version");

  if (method !== "initialize" && headerVersion !== undefined && !legacyVersions.includes(headerVersion)) {
    return unsupportedVersion(id, headerVersion);
  }

  switch (method) {
    case "initialize": {
      const requested = params.protocolVersion;
      const protocolVersion =
        typeof requested === "string" && legacyVersions.includes(requested) ? requested : legacyVersions[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: serverInfo(options),
        _meta: contractMeta,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: contract.tools });
    case "tools/call":
      return callTool(id, params, {}, database);
    default:
      return rpcError(200, id, -32601, "Method not found");
  }
}

function handleModern(
  request: IncomingMessage,
  id: JsonRpcId,
  method: string,
  params: JsonObject,
  meta: JsonObject,
  metaVersion: unknown,
  options: McpOptions,
  database: DatabaseSync,
): McpReply {
  const headerVersion = singleHeader(request, "mcp-protocol-version");

  if (typeof metaVersion !== "string" || !isObject(meta["io.modelcontextprotocol/clientCapabilities"])) {
    return rpcError(400, id, -32602, "Invalid params: missing required _meta fields");
  }

  if (headerVersion === undefined) {
    return rpcError(400, id, -32020, "Header mismatch: MCP-Protocol-Version header is missing");
  }

  if (headerVersion !== metaVersion) {
    return rpcError(400, id, -32020, "Header mismatch: MCP-Protocol-Version does not match the request body");
  }

  if (metaVersion !== modernVersion) {
    return unsupportedVersion(id, metaVersion);
  }

  const methodHeader = singleHeader(request, "mcp-method");

  if (methodHeader === undefined) {
    return rpcError(400, id, -32020, "Header mismatch: Mcp-Method header is missing");
  }

  if (methodHeader !== method) {
    return rpcError(400, id, -32020, "Header mismatch: Mcp-Method does not match the request body");
  }

  if (method === "tools/call") {
    const nameHeader = singleHeader(request, "mcp-name");

    if (nameHeader === undefined) {
      return rpcError(400, id, -32020, "Header mismatch: Mcp-Name header is missing");
    }

    if (decodeHeaderValue(nameHeader) !== params.name) {
      return rpcError(400, id, -32020, "Header mismatch: Mcp-Name does not match the request body");
    }
  }

  const modernMeta = { "io.modelcontextprotocol/serverInfo": serverInfo(options) };

  switch (method) {
    case "server/discover":
      return rpcResult(id, {
        resultType: "complete",
        supportedVersions,
        capabilities: { tools: {} },
        _meta: { ...modernMeta, ...contractMeta },
      });
    case "ping":
      return rpcResult(id, { resultType: "complete", _meta: modernMeta });
    case "tools/list":
      return rpcResult(id, { resultType: "complete", tools: contract.tools, _meta: modernMeta });
    case "tools/call":
      return callTool(id, params, { resultType: "complete", _meta: modernMeta }, database);
    default:
      return rpcError(404, id, -32601, "Method not found");
  }
}

function callTool(id: JsonRpcId, params: JsonObject, envelope: JsonObject, database: DatabaseSync): McpReply {
  const name = params.name;

  if (typeof name !== "string" || !toolNames.has(name)) {
    return rpcError(200, id, -32602, "Unknown tool");
  }

  const args = params.arguments ?? {};

  if (!isObject(args)) {
    return toolError(id, envelope, "Invalid arguments: arguments must be an object.");
  }

  const issues = inputValidators.get(name)?.(args) ?? [];

  if (issues.length > 0) {
    return toolError(id, envelope, describeIssues(issues));
  }

  switch (name) {
    case "push_briefing":
      return callPushBriefing(id, args as unknown as BriefingInput, envelope, database);
    default:
      return toolError(id, envelope, `${name} is not implemented yet.`);
  }
}

function callPushBriefing(id: JsonRpcId, input: BriefingInput, envelope: JsonObject, database: DatabaseSync): McpReply {
  const issues = briefingRuntimeIssues(input);

  if (issues.length > 0) {
    return toolError(id, envelope, describeIssues(issues));
  }

  return toolResult(id, envelope, { ...pushBriefing(database, input) });
}

function briefingRuntimeIssues(input: BriefingInput): SchemaIssue[] {
  const issues: SchemaIssue[] = [];

  if (!isCalendarDate(input.date)) {
    issues.push({ path: "/date", message: "must be a real calendar date" });
  }

  input.sections.forEach((section, sectionIndex) => {
    section.bullets.forEach((bullet, bulletIndex) => {
      (bullet.links ?? []).forEach((link, linkIndex) => {
        if (!isWebUrl(link.url)) {
          issues.push({
            path: `/sections/${sectionIndex}/bullets/${bulletIndex}/links/${linkIndex}/url`,
            message: "must be an absolute http: or https: URL",
          });
        }
      });
    });
  });

  return issues;
}

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function describeIssues(issues: SchemaIssue[]): string {
  const lines = issues.slice(0, maxReportedIssues).map((issue) => `${issue.path} ${issue.message}`);
  const more = issues.length > maxReportedIssues ? [`and ${issues.length - maxReportedIssues} more`] : [];
  return ["Invalid arguments:", ...lines, ...more].join("\n");
}

function toolResult(id: JsonRpcId, envelope: JsonObject, structuredContent: JsonObject): McpReply {
  return rpcResult(id, {
    ...envelope,
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
  });
}

function toolError(id: JsonRpcId, envelope: JsonObject, text: string): McpReply {
  return rpcResult(id, { ...envelope, content: [{ type: "text", text }], isError: true });
}

function serverInfo(options: McpOptions): JsonObject {
  return { name: "drizza", version: options.serverVersion };
}

function unsupportedVersion(id: JsonRpcId, requested: string): McpReply {
  return rpcError(400, id, -32022, "Unsupported protocol version", { supported: supportedVersions, requested });
}

function rpcResult(id: JsonRpcId, result: JsonObject): McpReply {
  return { status: 200, payload: { jsonrpc: "2.0", id, result } };
}

function rpcError(status: number, id: JsonRpcId | null, code: number, message: string, data?: unknown): McpReply {
  const error = data === undefined ? { code, message } : { code, message, data };
  const payload = id === null ? { jsonrpc: "2.0", error } : { jsonrpc: "2.0", id, error };
  return { status, payload };
}

function singleHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function decodeHeaderValue(value: string): string {
  if (value.startsWith("=?base64?") && value.endsWith("?=")) {
    return Buffer.from(value.slice(9, -2), "base64").toString("utf8");
  }

  return value;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBody(request: IncomingMessage): Promise<Buffer | null> {
  const declaredLength = Number(request.headers["content-length"]);

  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    request.resume();
    return null;
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.byteLength;
    if (size <= maxBodyBytes) chunks.push(buffer);
  }

  return size > maxBodyBytes ? null : Buffer.concat(chunks);
}
