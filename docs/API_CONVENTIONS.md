# agtls API Conventions

## Base URL
`/api/` (no version prefix)

## OpenAPI spec
The public REST surface is described by an OpenAPI 3.1 document served at
`GET /api/openapi.json` (add `?format=yaml` for YAML). It is assembled in
`src/lib/openapi/` — request bodies are generated from the shared Zod schemas in
`src/lib/api/schemas.ts` via `z.toJSONSchema()`, and response/error/list shapes are
defined in `src/lib/openapi/components.ts` to mirror the serializers. When you add or
change a core-resource endpoint, update `src/lib/openapi/paths.ts` to match.

## Authentication
- Pass `Authorization: Bearer agt_live_<key>` or `Authorization: Bearer agt_test_<key>`
- Auth is **optional** — unauthenticated requests work but resources are public (no owning organization)
- `resolveAuth(request)` from `@/lib/api/middleware` returns `AuthContext | null`
- If auth header is present but invalid, return 401
- Resource routes that browsers hit use `resolveViewer(request)` instead: it
  resolves the API key first, then falls back to the BetterAuth session
  cookie. A session viewer acts across every org the user is a member of
  (`viewerOrganizationIds`, `viewerCanAccess`, `viewerUser` helpers).

## Content Negotiation
Every resource route serves both HTML and JSON at the same path.
- Check `wantsHtml(request)` from `@/lib/api/accepts` in each handler
- Browser requests (Accept: text/html) → `htmlResponse(opts, request)` from `@/lib/api/html`
- API clients (Accept: application/json or no Accept) → JSON response as normal
- POST/PATCH/DELETE on HTML: redirect (303) to the item GET page after success
- Pass `user: viewerUser(viewer)` in `htmlResponse` opts so the header shows the
  signed-in account menu (dashboard / API keys / account / sign out)
- HTML GETs render friendly error pages via `errorHtmlResponse({status, title, message, user}, request)`
  for 403/404 instead of bare JSON; signed-out list pages render a sign-in
  `notice` instead of a table

## Resource IDs
Use `newId(type)` from `@/lib/api/ids`. Prefixes:
- `org_` — organization
- `mem_` — organization member
- `agt_` — API key (full key: `agt_live_*` or `agt_test_*`)
- `tsk_` — task (container)
- `sub_` — subtask (item within a task)
- `wh_`  — webhook endpoint
- `whe_` — webhook event
- `memo_` — memory (a stored file of content)
- `msg_` — scheduled message (delayed HTTP trigger)

## Error Envelope
All errors return JSON:
```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "resource_not_found",
    "message": "No task with ID 'tsk_abc123' exists.",
    "param": null
  }
}
```
Use helpers from `@/lib/api/errors` and `errorResponse()` from `@/lib/api/response`.

HTTP status codes:
- 400 — invalid_request_error
- 401 — authentication_error
- 403 — authorization_error
- 404 — not_found_error
- 500 — api_error

## Resource Object Shape
All resources use **Unix seconds** (not ISO strings) for timestamps — use `toUnix()` from `@/lib/api/response`.
```json
{
  "id": "tsk_abc123",
  "object": "task",
  "organization_id": "org_xyz",
  "created_at": 1749340800,
  "updated_at": 1749340800
}
```

## List Responses
Cursor-based pagination. Default limit: 20. Max: 100.
Query params: `limit`, `after` (cursor = last item ID).
```json
{
  "object": "list",
  "data": [...],
  "has_more": true,
  "next_cursor": "tsk_abc123"
}
```
Use `listResponse()` from `@/lib/api/response`.

## Ownership & Public Access
- Resources have a nullable `organization_id` column
- API-key requests: set `organization_id` from `auth.organizationId` on create
- Unauthenticated requests: `organization_id = null` (public resource). A
  session user creating a subtask under an owned parent task inherits the
  parent's org.
- On GET/PATCH/DELETE: if the resource has an `organization_id`, the caller
  needs a matching API key **or** a session belonging to a member of the
  owning org (`viewerCanAccess`). If `organization_id = null`, allow any
  request — anyone with the ID can read/write.
- **Lists never enumerate public resources.** List endpoints scope to the
  viewer's orgs: API key → that org; session → all orgs the user belongs to;
  anonymous → empty list (REST and MCP alike). Public resources stay
  reachable by ID and can be attached to an org later via the claim flow.

## Organizations & Members
- Organizations are managed by the BetterAuth organization plugin (`organization`, `member`, `invitation` tables); helpers live in `@/lib/orgs`
- Humans **and agents** are both `member` rows — agents are JIT-provisioned users. Roles: `owner`, `admin`, `member`
- A signed-up human gets a personal org automatically; an agent that registers unmatched owns a fresh org until a human claims it (`transferOwnership` demotes the agent to `member`)
- Browser sessions act across every org the user is a member of (`resolveViewer`); API keys are bound to exactly one org
- Session-guarded routes: `GET/POST /api/organizations`, `GET/PATCH/DELETE /api/organizations/{id}`, `GET /api/organizations/{id}/members`, `GET/POST /api/organizations/{id}/keys` (writes need `owner`/`admin`)
- The dashboard (`/dashboard`) lists each org's members — humans and agents — and its active API keys

## Claiming Public Resources
Resources created without auth additionally return a one-time `claim_token`
(`clm_*`, same format as the agent-auth claim ceremony) and a `claim_url` in
the creation response. Only the SHA-256 of the token is stored
(`claim_token_hash` column, helpers in `@/lib/api/claim`).

Any authenticated caller — including credentials issued through the agent-auth
`anonymous` or `identity_assertion` flows — can later take ownership:

```
POST /api/claim/{id}
Authorization: Bearer agt_live_...
{"claim_token": "clm_..."}
```

- `{id}` is the resource ID; the route dispatches on prefix (`tsk_`, `sub_`, `wh_`, `memo_`, `msg_`)
- Success: sets `organization_id` to the caller's organization, clears the token (one-shot), returns the resource
- Claiming a task also claims its public subtasks; claiming a webhook endpoint re-homes its events
- 401 if unauthenticated, 404 unknown ID, 403 `invalid_claim_token` on mismatch,
  400 `resource_already_claimed` / `resource_not_claimable` otherwise
- MCP mirror: the `claim` tool

## Scheduled Messages Delivery
Scheduled messages (`msg_`) fire an HTTP request to a URL at a future time.
There is no background worker in a serverless deployment, so delivery is pull-based:
- `dispatchDueMessages()` (`src/lib/messages/dispatch.ts`) selects messages whose
  `scheduled_at` has passed, atomically moves each `scheduled → delivering` (so
  overlapping runs never double-send), fires the request, and records the outcome
  (`delivered`/`failed`, `response_status`, `last_error`, `attempts`).
- `POST /api/messages/dispatch` runs it. A scheduler (Vercel Cron, system cron,
  etc.) must call this on an interval. Guard it by setting `CRON_SECRET` — callers
  then present `Authorization: Bearer <secret>`.
- Only `http`/`https` targets are accepted; other schemes are rejected at create time.

## Route File Pattern
Each resource lives in `src/app/api/<resource>/route.ts` (collection) and `src/app/api/<resource>/[id]/route.ts` (item).

## MCP Tool Pattern
Each feature exports a `fooTools(server: McpServer): void` function from `src/lib/mcp/tools/foo.ts`.
Use `server.tool(name, description, zodSchema, handler)` — zod v4 shapes.
Tools accept an optional `api_key` param so agents can pass their key directly.
Tools should mirror the REST API operations: list, get, create, update, delete.
