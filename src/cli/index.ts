#!/usr/bin/env node
const minimumVersion = "^22.13.0 || >=23.4.0";

function supportsNodeSqlite(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map((part) => Number.parseInt(part, 10));
  if (major === 22) return minor >= 13;
  if (major === 23) return minor >= 4;
  return major > 23;
}

if (supportsNodeSqlite(process.versions.node)) {
  await import("./main.js");
} else {
  console.error(
    `O Drizza precisa do Node.js ${minimumVersion} (usa o node:sqlite embutido). Versão atual: ${process.versions.node}. Atualize o Node e rode de novo.`,
  );
  process.exitCode = 1;
}
