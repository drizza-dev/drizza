#!/usr/bin/env node
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { Server } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createDrizzaServer } from "../server/server.js";
import { openDatabase } from "../server/database.js";

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

function closeResources(server: Server, database: DatabaseSync): void {
  server.close(() => database.close());
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

  try {
    database = openDatabase(options.databasePath);
    const server = createDrizzaServer({
      database,
      distDirectory: fileURLToPath(new URL("../", import.meta.url)),
      port: options.port,
    });

    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.error(`A porta ${options.port} já está ocupada. Escolha outra com --port <porta>.`);
      } else {
        console.error(`Não foi possível iniciar o servidor: ${error.message}`);
      }
      database?.close();
      process.exitCode = 1;
    });

    server.listen(options.port, "127.0.0.1", () => {
      console.log(`Drizza disponível em http://127.0.0.1:${options.port}`);
      console.log(`Banco SQLite: ${options.databasePath}`);
      process.once("SIGINT", () => closeResources(server, database as DatabaseSync));
      process.once("SIGTERM", () => closeResources(server, database as DatabaseSync));
    });
  } catch (error) {
    database?.close();
    console.error(`Não foi possível iniciar o Drizza: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

main();
