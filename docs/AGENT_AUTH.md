# Agent Auth (auth.md)

Implementation of the [WorkOS auth.md](https://workos.com/auth-md/docs/apps) agent
registration flows. Lets AI agents authenticate against agtls on behalf of a
user. Both flows are supported.

## Flows

| On-wire `type` / `assertion_type`        | Conceptual flow              | Credential timing |
| ---------------------------------------- | ---------------------------- | ----------------- |
| `identity_assertion` + `id-jag`          | Agent verified               | Issued synchronously after ID-JAG verification |
| `anonymous`                              | User claimed · anonymous start | Issued up front (pre-claim scopes), upgraded in place on claim |
| `service_auth` (`login_hint`: email)     | User claimed · service auth  | Withheld until OTP claim completes |

`service_auth` follows CIBA's `login_hint`: the agent hints at who the user is
(today an email) and agtls authenticates the user out-of-band. Agents send
`service_auth` and `anonymous` without consulting discovery — opt-out is
signaled by a `*_not_enabled` error. `identity_assertion.assertion_types_supported`
*is* worth cross-checking, since provider trust setup isn't trial-discoverable.

## Discovery

- `GET /.well-known/oauth-protected-resource` — PRM (RFC 9728)
- `GET /.well-known/oauth-authorization-server` — AS metadata with the `agent_auth` block
- `GET /auth.md` — prose discovery doc
- Every API `401` carries `WWW-Authenticate: Bearer resource_metadata="…"` (added centrally in `errorResponse`).

These public paths are served by handlers under `src/app/api/discovery/*` via
rewrites in `next.config.ts` (the App Router doesn't reliably route
dot-prefixed segments like `.well-known`).

## Endpoints

- `POST /api/agent/auth` — register; dispatches on `type` / `assertion_type`
- MCP `agent_auth` tool (`action: register`) — same registration over MCP, so an
  agent can get a credential without leaving the MCP session (see
  `src/lib/mcp/tools/register.ts`)
- `POST /api/agent/auth/claim` — start OTP claim (anonymous start only)
- `POST /api/agent/auth/claim/complete` — finish claim, match/JIT the user
- `POST /api/agent/auth/claim-link` — mint a fresh direct claim link for an
  authenticated, unclaimed anonymous credential (see below)
- MCP `agent_auth` tool (`action: request_claim_link`) — same, over MCP
- `POST /api/agent/auth/revoke` — back-channel revocation (`application/logout+jwt`)
- `GET /agent/claim/[token]` — server-rendered OTP page the claim email links to
- `GET /agent/link/[token]` — server-rendered direct claim page (below)

## Direct claim link (no email/OTP)

A second way to claim an `anonymous` registration, for when the agent can hand a
link straight to its human (e.g. paste it in chat) rather than knowing their
email. It's the reverse trust direction of the OTP ceremony: there the human
reads a code *back* to the agent; here the human's own browser **session** is
the authorization.

- Anonymous registration (`POST /api/agent/auth` `{ "type": "anonymous" }`, and
  the `agent_auth` MCP tool with `action: register`) returns a **`claim_link`** —
  `${APP_URL}/agent/link/{cvt_…}` — alongside the credential. The `cvt_` view
  token in the URL is distinct from the agent's `clm_` `claim_token`, so the
  agent shares the link without exposing its own completion secret.
- The human opens it. If signed out, the page links to `/sign-up` / `/sign-in`
  carrying `?next=/agent/link/{token}` so they return after authenticating. If
  signed in, they click **Claim this agent**.
- On confirm, `completeDirectClaim` (`src/lib/agent-auth/service.ts`) transfers
  ownership of the agent's org to the human (`transferOwnership` — agent demoted
  to `member`), upgrades the credential to post-claim scopes in place, and marks
  the registration `claimed`. The agent keeps the same credential.
- `getDirectClaimView` renders the page read-only (mints nothing), so link
  prefetchers can't consume or alter the claim. Only unclaimed, unexpired
  `anonymous` registrations are claimable this way.
- `agent_auth` (`action: request_claim_link`) / `POST /api/agent/auth/claim-link`
  re-mint a fresh link for an already-registered agent that lost the original or
  let it expire.

## Credentials & principals

- Credentials are `agt_live_*` keys (same as the rest of agtls; `resolveAuth`
  keys off the prefix). `access_token` credentials get `expiresAt`; `api_key`
  credentials don't. No refresh tokens exist, so the spec's "no refresh token
  from ID-JAG" rule holds automatically.
- The principal that owns a credential is an **organization**. Agent
  registrations create an agent-flagged user that joins (or owns) an org; on
  claim the matched human takes over as owner and the agent stays a member,
  or the JIT user is promoted.
- User matching order: delegation `(iss, sub)` → our verified email → JIT.

## Configuration

- `AGENT_AUTH_TRUSTED_PROVIDERS` (env, JSON) — the agent-verified trust list.
  Unset ⇒ agent-verified disabled; user-claimed flows still work.
- Scopes, lifetimes, and derived discovery URLs live in `src/lib/agent-auth/config.ts`.
- Email transport is pluggable (`src/lib/email.ts`); with no provider configured
  it logs the claim link/OTP to the console (fine for local dev).

## Layout

```
src/lib/agent-auth/
  config.ts            scopes, lifetimes, discovery URLs
  discovery.ts         PRM / AS metadata / auth.md builders
  errors.ts            AgentAuthError + flat error envelope
  tokens.ts            claim/view-token + OTP generation, SHA-256 hashing  (pure)
  idjag.ts             ID-JAG + logout-token verification                  (pure, injected deps)
  jwks.ts              cached remote JWKSets
  replay.ts            shared jti replay cache (DB)
  trusted-providers.ts trust list (env config)
  users.ts             matching / JIT / principal creation
  credentials.ts       issue / upgrade / revoke credentials
  audit.ts             audit event recording
  rate-limit.ts        two-tier sliding window
  service.ts           flow orchestration (register / claim / complete / revoke)
```

Verify the pure verification core (no DB/network): `npx tsx test/scripts/agent-auth-smoke.ts`.

## Manual HTTP testing

`test/scripts/manual-idjag-test.ts` runs the full ID-JAG flow against a live dev
server — registration, MCP access, back-channel revoke, and revoked-token
rejection. It serves its own JWKS endpoint so no external provider is needed.

**First run** (configures `.env.local` and exits):
```bash
npx tsx test/scripts/manual-idjag-test.ts
# → generates .test-idjag-keys.json, patches .env.local, asks you to restart
npm run dev   # restart to pick up AGENT_AUTH_TRUSTED_PROVIDERS
```

**Subsequent runs** (actual test):
```bash
npx tsx test/scripts/manual-idjag-test.ts
```

### Pointing an agent client at the local MCP server

Any MCP-capable client (Cursor, Claude Code) can talk to `http://localhost:3000/api/mcp`
once it has a valid `agt_live_*` token. Get one by running the script above
(the token is not printed — grab it from the app UI or run the anonymous flow):

```bash
# Anonymous registration — works even without AGENT_AUTH_TRUSTED_PROVIDERS
curl -s -X POST http://localhost:3000/api/agent/auth \
  -H 'Content-Type: application/json' \
  -d '{"type":"anonymous"}' | jq .
```

Then configure the client. For Cursor, add `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "agtls-local": {
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer agt_live_<your-token>" }
    }
  }
}
```

For Claude Code, add to `.claude/settings.json`:
```json
{
  "mcpServers": {
    "agtls-local": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer agt_live_<your-token>" }
    }
  }
}
```

## Deferred (documented in code)

- Rate limiting is in-process (fail-open); back it with Redis for multi-replica.
- JWKS cache is in-process (fine per replica). The jti replay cache is shared (DB).
- CIMD resolution of URL `client_id`s — currently compared opaquely.
- Forced credential rotation on anonymous claim (opt-in) — not implemented.
- Bulk per-tenant revocation admin tooling, SET/CAEP event delivery.
- `expireStaleRegistrations()` exists but is not scheduled — wire it to a cron.
