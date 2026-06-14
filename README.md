# agtls

Open infrastructure for AI agents. Task lists, webhook catchers, artifacts, scheduled messages, and more — available via REST and MCP.

## Features

| Tool | REST | MCP | Status |
|------|------|-----|--------|
| Task Lists | `/api/tasks` | `tasks_*` | ✅ |
| Webhook Catcher | `/api/webhooks`, `/api/catch/:id` | `webhook_*` | ✅ |
| Artifacts | `/api/artifacts` | `artifact_*` | ✅ |
| Scheduled Messages | `/api/messages`, `/api/messages/dispatch` | `messages_*` | ✅ |

## MCP endpoint

```
POST /api/mcp
Authorization: Bearer agt_<key>
```

All tools available via the Model Context Protocol (Streamable HTTP transport).

## Auth model

No API key required — resources are public by default, accessible to anyone with the ID. Create an organization and API key to own your resources. Humans and agents are both organization members — sign in to see every agent with access to your resources.

```bash
# Authenticated request
curl -H "Authorization: Bearer agt_..." /api/tasks

# Unauthenticated (public)
curl /api/tasks/tsk_abc123
```

## Setup

```bash
# 1. Install
npm install

# 2. Configure
cp .env.local.example .env.local
# Fill in BETTER_AUTH_SECRET

# 3. Create tables in the local D1 database
npm run db:migrate:local

# 4. Run
npm run dev
```

## Deploy (Cloudflare Workers)

```bash
# One-time: create the D1 database and put its id in wrangler.jsonc
npx wrangler d1 create agtls-db

# Apply migrations to the production database
npm run db:migrate:remote

# Secrets
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put CRON_SECRET   # recommended; guards /api/messages/dispatch

# Ship it (or `npm run preview` to test in workerd locally first)
npm run deploy:prod
```

Scheduled-message delivery runs on a Workers cron trigger (`wrangler.jsonc`,
every minute) — no external scheduler needed.

### Preview deployments

`npm run deploy` ships the current tree to **https://preview.agtls.dev**
— a separate Worker (`agtls-preview`) with its own D1 database
(`agtls-db-preview`, schema via `npm run db:migrate:preview`) and its own
secrets (`wrangler secret put <NAME> --env preview`). Preview responses carry
`X-Robots-Tag: noindex` and a deny-all `robots.txt`, so it never gets indexed.

Both `deploy` and `deploy:prod` run `npm run check` (typecheck + tests) first
via npm pre-hooks and abort if anything fails.

## Stack

- **Next.js 16** — App Router, API routes, deployed to **Cloudflare Workers** via OpenNext
- **BetterAuth** — email/password auth, session management
- **Drizzle ORM** — type-safe queries
- **Cloudflare D1** — serverless SQLite
- **MCP SDK** — Model Context Protocol tools

## License

MIT
