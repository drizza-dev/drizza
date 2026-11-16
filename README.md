# Drizza

A local dashboard for your daily work context: the pull requests waiting on you, the ones you have open, and a daily briefing that your own coding agent writes and delivers through MCP.

Everything runs on your machine. Drizza keeps a local SQLite database, never stores your GitHub token, and never calls a language model: your agent (Claude Code or Codex) does the writing.

Docs: [docs.drizza.dev](https://docs.drizza.dev) ([pt-BR](https://docs.drizza.dev/pt/)).

## Requirements

- Node.js 22.13+ or 23.4+ (Drizza uses the built in `node:sqlite`).
- For GitHub: the `gh` CLI signed in, or a fine grained token in `DRIZZA_GITHUB_TOKEN`.

## Run it

```sh
npx drizza
```

Drizza starts at `http://127.0.0.1:4340` and keeps its data in `~/.drizza`. Use `--port` and `--db` to change either. On start it prints the local MCP endpoint and the commands to register it in Claude Code and Codex; the MCP token stays in a file and is never printed.

## What works today

- **GitHub:** press Sync Now to pull your open pull requests (reviews requested from you and the ones you authored).
- **MCP:** a local endpoint at `/mcp` with a bearer token and three tools: `push_briefing`, `push_items` and `get_today`.
- **Briefing:** the `drizza-briefing` skill teaches your agent to read your day, write the briefing and push it. It shows up in the dashboard without a reload.
- **Slack:** not yet.

## Briefing skill

The skill ships with the package and lives in [`skills/drizza-briefing/SKILL.md`](skills/drizza-briefing/SKILL.md). Copy it into your agent's skills folder:

```sh
mkdir -p ~/.claude/skills/drizza-briefing && curl -fsSL https://raw.githubusercontent.com/drizza-dev/drizza/main/skills/drizza-briefing/SKILL.md -o ~/.claude/skills/drizza-briefing/SKILL.md
```

```sh
mkdir -p ~/.codex/skills/drizza-briefing && curl -fsSL https://raw.githubusercontent.com/drizza-dev/drizza/main/skills/drizza-briefing/SKILL.md -o ~/.codex/skills/drizza-briefing/SKILL.md
```

Then run `/drizza-briefing` in Claude Code or `$drizza-briefing` in Codex. In non interactive Codex (`codex exec`), the drizza MCP tools must be approved in its config, or Codex blocks the push. The [MCP guide](https://docs.drizza.dev/guide/mcp/) has the full setup.

## Develop

```sh
pnpm install
```

```sh
pnpm build
```

```sh
node dist-node/cli/index.js --port 4399 --db /tmp/drizza-dev.db
```

`pnpm dev` serves only the Vite UI, without the local API. See [CONTRIBUTING](https://github.com/drizza-dev/.github/blob/main/CONTRIBUTING.md).

## License

MIT
