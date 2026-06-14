@AGENTS.md

# agtls

Open infrastructure for AI agents. REST + MCP first.

## Stack
- Next.js 16 (App Router, TypeScript), deployed to Cloudflare Workers via `@opennextjs/cloudflare`
- BetterAuth — user sessions + organizations (organization plugin)
- Drizzle ORM + Cloudflare D1 (SQLite) — `db` in `src/lib/db` is a lazy proxy over the `DB` binding
- @modelcontextprotocol/sdk

Scheduled-message delivery runs on a Workers cron trigger: `worker.ts` wraps the
OpenNext handler and its `scheduled` handler hits `/api/messages/dispatch`.

## Auth model
API key auth is **optional**. `resolveAuth(request)` in `src/lib/api/middleware.ts` returns `AuthContext | null`.
- Authenticated (Bearer `agt_live_*`): resource is organization-owned
- Unauthenticated: resource is public (anyone with the ID can read/write)

Humans and agents are both org **members** (agents are JIT-provisioned users), so a signed-in human sees every agent with access to their resources on `/dashboard`. Org helpers: `src/lib/orgs/`.

See `docs/API_CONVENTIONS.md` for error envelope, pagination, and ownership rules.

## Key commands
```bash
npm run dev                # start dev server (local D1 via wrangler proxy)
npm run db:generate        # generate SQL migrations into ./drizzle
npm run db:migrate:local   # apply migrations to the local D1 (dev/preview)
npm run db:migrate:remote  # apply migrations to production D1
npm run preview            # OpenNext build + run in workerd locally
npm run deploy:prod        # deploy to production (agtls.dev)
npm run deploy             # deploy to preview.agtls.dev (own worker + D1, noindexed)
npm run db:migrate:preview # apply migrations to the preview D1
```
Both deploy scripts run `npm run check` (tsc + vitest) first via npm pre-hooks.

## Environment
Copy `.env.local.example` to `.env.local` and fill in:
- `BETTER_AUTH_SECRET` — random secret (`openssl rand -base64 32`)
- `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` — app URL

`next dev` reads `.env.local`; `npm run preview` reads `.dev.vars` (see
`.dev.vars.example`); production reads Worker vars (`wrangler.jsonc`) and
secrets (`wrangler secret put`). The D1 database id lives in `wrangler.jsonc`.
