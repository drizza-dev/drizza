#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Server } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createDrizzaServer } from "../server/server.js";
import { openDatabase } from "../server/database.js";
import { ensureMcpToken, mcpTokenPath } from "../server/mcp-token.js";

const defaultPort = 4340;
const usage = "Uso: drizza [--port <porta>] [--db <caminho>]";

interface CliOptions {
  port: number;
  databasePath: string;
}

function parseOptions(args: string[]): CliOptions {
  let port = defaultPort;
  let databasePath = join(homedir(), ".drizza", "drizza.db");

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const separatorIndex = argument.indexOf("=");
    const flag = separatorIndex === -1 ? argument : argument.slice(0, separatorIndex);
    const inlineValue = separatorIndex === -1 ? undefined : argument.slice(separatorIndex + 1);
    const value = inlineValue ?? args[index + 1];

    if (flag !== "--port" && flag !== "--db") {
      throw new Error(`Opção desconhecida: ${flag}`);
    }

    if (!value || (inlineValue === undefined && value.startsWith("--"))) {
      throw new Error(`Informe um valor para ${flag}.`);
    }

    if (inlineValue === undefined) index += 1;

    if (flag === "--port") {
      if (!/^\d+$/.test(value)) throw new Error("A porta deve ser um número inteiro entre 1 e 65535.");
      port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("A porta deve ser um número inteiro entre 1 e 65535.");
      }
    } else {
      databasePath = expandPath(value);
    }
  }

  return { port, databasePath };
}

function expandPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(path);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function packageVersion(): string {
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    version?: unknown;
  };
  return typeof manifest.version === "string" ? manifest.version : "0.0.0";
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function printMcpSetup(port: number, tokenPath: string): void {
  const mcpUrl = `http://127.0.0.1:${port}/mcp`;
  const readToken = `$(cat ${shellQuote(tokenPath)})`;

  console.log(`MCP local: ${mcpUrl}`);
  console.log(`Token do MCP: guardado em ${tokenPath} (não é exibido aqui)`);
  console.log("Para registrar no Claude Code:");
  console.log(`  claude mcp add --transport http drizza ${mcpUrl} --header "Authorization: Bearer ${readToken}"`);
  console.log("Para registrar no Codex (a variável precisa existir no shell que abre o Codex):");
  console.log(`  export DRIZZA_MCP_TOKEN="${readToken}"`);
  console.log(`  codex mcp add drizza --url ${mcpUrl} --bearer-token-env-var DRIZZA_MCP_TOKEN`);
}

function closeResources(server: Server, closeDatabase: () => void): void {
  server.close(() => closeDatabase());
}

function main(): void {
  let options: CliOptions;

  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    console.error(`drizza: ${errorMessage(error)}`);
    console.error(usage);
    process.exitCode = 2;
    return;
  }

  let database: DatabaseSync | undefined;
  let databaseClosed = false;
  const closeDatabase = () => {
    if (!database || databaseClosed) return;
    database.close();
    databaseClosed = true;
  };

  try {
    database = openDatabase(options.databasePath);
    const tokenPath = mcpTokenPath(options.databasePath);
    const server = createDrizzaServer({
      database,
      distDirectory: fileURLToPath(new URL("../../dist/", import.meta.url)),
      port: options.port,
      mcp: { token: ensureMcpToken(tokenPath), serverVersion: packageVersion() },
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.error(`A porta ${options.port} já está ocupada. Escolha outra com --port <porta>.`);
      } else {
        console.error(`Erro no servidor local: ${error.message}`);
      }
      closeDatabase();
      if (server.listening) server.close();
      process.exitCode = 1;
    });

    server.listen(options.port, "127.0.0.1", () => {
      console.log(`Drizza disponível em http://127.0.0.1:${options.port}`);
      console.log(`Banco SQLite: ${options.databasePath}`);
      printMcpSetup(options.port, tokenPath);
      process.once("SIGINT", () => closeResources(server, closeDatabase));
      process.once("SIGTERM", () => closeResources(server, closeDatabase));
    });
  } catch (error) {
    closeDatabase();
    console.error(`Não foi possível iniciar o Drizza: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

main();
