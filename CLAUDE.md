@AGENTS.md

# agtools

Open-source infrastructure for AI agents. REST + MCP first.

## Stack
- Next.js 16 (App Router, TypeScript)
- BetterAuth — user sessions
- Drizzle ORM + Neon Postgres
- @modelcontextprotocol/sdk

## Auth model
API key auth is **optional**. `resolveAuth(request)` in `src/lib/api/middleware.ts` returns `AuthContext | null`.
- Authenticated (Bearer `agt_live_*`): resource is project-owned
- Unauthenticated: resource is public (anyone with the ID can read/write)

See `API_CONVENTIONS.md` for error envelope, pagination, and ownership rules.

## Key commands
```bash
npm run dev          # start dev server
npm run db:push      # push schema to Neon (requires DATABASE_URL)
npm run db:generate  # generate migration files
npm run db:studio    # open Drizzle Studio
```

## Environment
Copy `.env.local.example` to `.env.local` and fill in:
- `DATABASE_URL` — Neon connection string
- `BETTER_AUTH_SECRET` — random secret (`openssl rand -base64 32`)
- `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` — app URL
