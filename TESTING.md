# Testing

agtls has two test layers, both fully self-contained — they run with **no
external services** (no Neon, no SMTP, no provider JWKS endpoints).

| Layer | Runner | What it covers | DB |
| ----- | ------ | -------------- | -- |
| Unit + integration | **Vitest** | pure logic, every REST route, auth, the full agent-auth (auth.md) flows | in-process **PGlite** (WASM Postgres) |
| End-to-end | **Playwright** | the real app in a browser: landing page, content-negotiated HTML, the claim OTP ceremony | a `next dev` server backed by PGlite |

```bash
npm test          # Vitest (unit + integration) — fast, no browser
npm run test:watch
npm run test:e2e  # Playwright — boots a dev server, drives Chromium
```

## How the stubbing works

The design goal is **real behavior, zero external dependencies**.

- **Database** — `@/lib/db` is mocked (Vitest) / driver-switched (E2E) to
  [PGlite](https://github.com/electric-sql/pglite), an in-process WASM build of
  Postgres. The actual Drizzle schema is pushed into it via `drizzle-kit`'s
  programmatic migration API, so handlers run **real SQL** against a real
  Postgres engine — not a hand-written mock. Tables are truncated between tests.
- **Provider JWKS** (agent-verified / ID-JAG flow) — the remote key fetch is
  replaced with an in-memory `jose` ES256 keypair. Tests mint their own ID-JAGs
  and logout tokens with it. See `test/helpers/agent-auth.ts`.
- **Email** — the pluggable transport in `src/lib/email.ts` is captured: in
  Vitest via `setEmailSender` (`test/helpers/email.ts`), in E2E by writing each
  message to a file the browser tests read back (the claim link / OTP).
- **Sessions** (BetterAuth, for the `projects`/`keys` routes) —
  `betterAuth.api.getSession` is spied per-test (`test/helpers/session.ts`);
  `next/headers` is stubbed globally.
- **Rate limiter / trust list / JWKS caches** — the in-process caches are reset
  before each test so cases don't leak into one another.

The only `src/` accommodations for testing (all test-gated, no production
effect) are: a PGlite driver branch in `src/lib/db/index.ts` keyed off
`AGTLS_TEST_DB_DIR`, an email-capture branch in `src/lib/email.ts` keyed off
`AGTLS_TEST_EMAIL_FILE`, and `_reset*` helpers alongside the existing ones.

## Layout

```
test/
  setup.ts                 global Vitest setup (db mock, resets, env)
  helpers/
    db.ts                  PGlite instance + schema migration + truncate
    request.ts             makeRequest / json / routeParams
    seed.ts                seedProject → { projectId, key, ... }
    agent-auth.ts          trusted-provider + ID-JAG / logout-token minting
    email.ts               captured-email accessors
    session.ts             BetterAuth session spies
  unit/                    pure-logic + small DB-backed helpers
  api/                     REST routes: tasks, subtasks, webhooks (+ ingestion)
  agent-auth/              register / claim / revoke / rate-limit flows
  e2e/                     Playwright specs + migrate-db + helpers
scripts/e2e.sh             E2E orchestrator (migrate → next dev → playwright)
```

## Writing a test

```ts
import { makeRequest, json, routeParams } from "../helpers/request";
import { seedProject } from "../helpers/seed";

const { GET, POST } = await import("@/app/api/tasks/route");
const { key } = await seedProject();                       // owns its resources
const res = await POST(makeRequest("/api/tasks", { body: { name: "x" }, token: key }));
// item routes take the params arg:
await GET(makeRequest(`/api/tasks/${id}`, { token: key }), routeParams({ id }));
```

For the agent-verified flow, opt into the in-memory trusted provider:

```ts
import { useTrustedProvider, mintIdJag } from "../helpers/agent-auth";
await useTrustedProvider();
const assertion = await mintIdJag();        // valid ID-JAG; tweak via options
```

## Notes

- E2E is run through `scripts/e2e.sh` (not `playwright test` directly): it
  migrates a fresh PGlite db, boots `next dev`, waits for readiness, then runs
  Playwright and tears the server down. Playwright's own `webServer` option is
  not used because it spawns commands in a shell where the local toolchain does
  not resolve reliably in every environment.
- `npx playwright install chromium` is required once before the first E2E run.
