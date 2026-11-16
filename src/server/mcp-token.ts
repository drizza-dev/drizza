import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const tokenPattern = /^[0-9a-f]{64}$/;

export function mcpTokenPath(databasePath: string): string {
  return join(dirname(databasePath), "mcp-token");
}

export function ensureMcpToken(tokenPath: string): string {
  const token = randomBytes(32).toString("hex");

  try {
    writeFileSync(tokenPath, `${token}\n`, { flag: "wx", mode: 0o600 });
    return token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  const stats = lstatSync(tokenPath);

  if (!stats.isFile()) {
    throw new Error(`O token do MCP em ${tokenPath} não é um arquivo comum. Apague-o para gerar outro.`);
  }

  if ((stats.mode & 0o077) !== 0) {
    throw new Error(
      `O arquivo do token do MCP em ${tokenPath} pode ser lido por outros usuários. Rode chmod 600 nele ou apague-o para gerar outro.`,
    );
  }

  const existing = readFileSync(tokenPath, "utf8").trim();

  if (!tokenPattern.test(existing)) {
    throw new Error(`O arquivo do token do MCP em ${tokenPath} está em formato inválido. Apague-o para gerar outro.`);
  }

  return existing;
}

export function bearerMatches(authorizationHeader: string | undefined, token: string): boolean {
  if (!authorizationHeader) return false;

  const match = /^Bearer[ ]+([^\s]+)[ ]*$/i.exec(authorizationHeader);
  if (!match) return false;

  const received = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(token).digest();
  return timingSafeEqual(received, expected);
}
