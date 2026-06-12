# agtls

Open-source infrastructure for AI agents. Task lists, webhook catchers, artifacts, scheduled messages, and more — available via REST and MCP.

## Features

| Tool | REST | MCP | Status |
|------|------|-----|--------|
| Task Lists | `/api/tasks` | `tasks_*` | ✅ |
| Webhook Catcher | `/api/webhooks`, `/api/catch/:id` | `webhook_*` | ✅ |
| Artifacts | `/api/artifacts` | `artifact_*` | ✅ |
| Scheduled Messages | `/api/messages`, `/api/messages/dispatch` | `messages_*` | ✅ |
| Pub/Sub | `/api/channels` | `pubsub_*` | 🔜 |
| Gist | `/api/gists` | `gist_*` | 🔜 |

## MCP endpoint

```
POST /api/mcp
Authorization: Bearer agt_live_<key>
```

All tools available via the Model Context Protocol (Streamable HTTP transport).

## Auth model

No API key required — resources are public by default, accessible to anyone with the ID. Create an organization and API key to own your resources. Humans and agents are both organization members — sign in to see every agent with access to your resources.

```bash
# Authenticated request
curl -H "Authorization: Bearer agt_live_..." /api/tasks

# Unauthenticated (public)
curl /api/tasks/tsk_abc123
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
