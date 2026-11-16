---
name: "drizza-briefing"
description: "Build today's work briefing from the sources you can already reach (GitHub through gh, plus Slack, Linear or others only if connected) and push it to the local drizza dashboard through its MCP tools get_today and push_briefing. Use when the user asks for their drizza briefing, to update drizza for today, or runs /drizza-briefing or $drizza-briefing."
---

# drizza briefing

You write the daily briefing that the local drizza dashboard shows in its "Briefing de hoje" card. drizza never calls a model: you collect the context with the user's own access, write the briefing, and push it through the `drizza` MCP server. The card updates by itself a few seconds after the push.

## Before you start

The `drizza` MCP server must be registered in this agent. Its tools appear as `get_today` and `push_briefing` (in Claude Code, `mcp__drizza__get_today` and `mcp__drizza__push_briefing`). If they are not available, stop and tell the user to start `drizza` and register the MCP server with the commands it prints on start. Do not try to reach drizza any other way: no curl, no reading the token file, no writing to its database.

## 1. Read what drizza already has

Call `get_today` with exactly:

```json
{ "contract_version": "1" }
```

Use the `date` it returns (`YYYY-MM-DD`, local time of the machine running drizza) as the date of the briefing. Do not compute the date yourself.

If `briefing` is not null, a briefing for that day already exists. Pushing again replaces it completely, so carry over whatever from it is still true and drop what is done. If the response has an `items` array, you may use it as extra context; treat it as optional, it can be missing or empty.

## 2. Collect today's context

Use only sources you can reach in this session. None of them is mandatory except trying GitHub when `gh` works.

- GitHub, when `gh auth status` succeeds:
  - review requests: `gh search prs --review-requested=@me --state=open --json repository,number,title,url,updatedAt,isDraft --limit 30`
  - your open pull requests: `gh search prs --author=@me --state=open --json repository,number,title,url,updatedAt,isDraft --limit 30`
  - optionally, for the most relevant ones, `gh pr view <url> --json reviewDecision,statusCheckRollup,comments` to say whether checks fail, changes were requested or there is a new comment.
- Slack, Linear, calendar or any other source only if you already have a tool for it in this session (an MCP server or a CLI that is already authenticated). If there is none, skip it and do not ask the user to connect it.

If no source works, say so to the user and do not push an empty or invented briefing.

## 3. Write the briefing

Write in the language the user talks to you in. Be short and concrete: what needs attention today and why, each point with the link to where it lives. Never invent a link; every `url` must be one you saw in a source.

The payload has to match the `push_briefing` input schema exactly. No other field is accepted.

```json
{
  "contract_version": "1",
  "date": "<date returned by get_today>",
  "agent": "<your name, for example claude-code or codex>",
  "headline": "<one sentence for the day>",
  "sections": [
    {
      "title": "<section title>",
      "bullets": [
        {
          "text": "<what to look at and why>",
          "links": [
            { "url": "https://github.com/<owner>/<repo>/pull/<n>", "label": "<owner>/<repo>#<n>", "source": "github" }
          ]
        }
      ]
    }
  ]
}
```

Rules, taken from the schema:

- `contract_version`: always the string `"1"`.
- `date`: `YYYY-MM-DD`, the one from `get_today`.
- `agent`: 1 to 64 characters.
- `headline`: 1 to 200 characters.
- `sections`: 1 to 12. Each has `title` (1 to 120 characters) and `bullets` (1 to 30). Leave out a section that would have no bullet.
- Each bullet has `text` (1 to 1000 characters) and, optionally, `links` (up to 10).
- Each link has exactly `url`, `label` and `source`. `url` is an absolute `http://` or `https://` URL of up to 2048 characters; `label` has 1 to 200 characters; `source` is one of `"github"`, `"slack"` or `"other"` (use `"other"` for Linear, calendar and anything else).
- A bullet may also carry `item_refs` (up to 10, each with exactly `source`, 1 to 32 characters, and `external_id`, 1 to 256 characters), but only to point at items you pushed with `push_items`. If you did not, leave `item_refs` out.

A good default shape: a section for reviews waiting on the user, one for the user's own pull requests that need action (failing checks, changes requested, new comments), and one for conversations or tickets when those sources were available.

## 4. Push it

Call `push_briefing` with the payload. On success it returns `briefing_id`, `date` and `replaced`. If it returns an error, read the message, fix the payload and try again once; do not drop fields the user would miss just to get past validation.

Finish by telling the user, in one or two lines, that the briefing is in drizza, which sources you used and which you could not reach.
