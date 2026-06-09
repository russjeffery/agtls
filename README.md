# agtools

Open-source infrastructure for AI agents. Task lists, webhook catchers, pub/sub, and more — available via REST and MCP.

## Features

| Tool | REST | MCP | Status |
|------|------|-----|--------|
| Task Lists | `/api/v1/task-lists`, `/api/v1/tasks` | `tasks_*` | ✅ |
| Webhook Catcher | `/api/v1/webhook-endpoints`, `/api/v1/catch/:id` | `webhook_*` | ✅ |
| Pub/Sub | `/api/v1/channels` | `pubsub_*` | 🔜 |
| Gist | `/api/v1/gists` | `gist_*` | 🔜 |

## MCP endpoint

```
POST /api/mcp
Authorization: Bearer agt_live_<key>
```

All tools available via the Model Context Protocol (Streamable HTTP transport).

## Auth model

No API key required — resources are public by default, accessible to anyone with the ID. Create a project and API key to own your resources.

```bash
# Authenticated request
curl -H "Authorization: Bearer agt_live_..." /api/v1/tasks

# Unauthenticated (public)
curl /api/v1/tasks/tsk_abc123
```

## Setup

```bash
# 1. Install
npm install

# 2. Configure
cp .env.local.example .env.local
# Fill in DATABASE_URL and BETTER_AUTH_SECRET

# 3. Create tables
npm run db:push

# 4. Run
npm run dev
```

## Stack

- **Next.js 16** — App Router, API routes
- **BetterAuth** — email/password auth, session management
- **Drizzle ORM** — type-safe queries
- **Neon** — serverless Postgres
- **MCP SDK** — Model Context Protocol tools

## License

MIT
