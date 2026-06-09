# agtools API Conventions

## Base URL
`/api/` (no version prefix)

## Authentication
- Pass `Authorization: Bearer agt_live_<key>` or `Authorization: Bearer agt_test_<key>`
- Auth is **optional** — unauthenticated requests work but resources are public (no project owner)
- `resolveAuth(request)` from `@/lib/api/middleware` returns `AuthContext | null`
- If auth header is present but invalid, return 401

## Content Negotiation
Every resource route serves both HTML and JSON at the same path.
- Check `wantsHtml(request)` from `@/lib/api/accepts` in each handler
- Browser requests (Accept: text/html) → `htmlResponse(opts, request)` from `@/lib/api/html`
- API clients (Accept: application/json or no Accept) → JSON response as normal
- POST/PATCH/DELETE on HTML: redirect (303) to the item GET page after success

## Resource IDs
Use `newId(type)` from `@/lib/api/ids`. Prefixes:
- `prj_` — project
- `agt_` — API key (full key: `agt_live_*` or `agt_test_*`)
- `tsk_` — task (container)
- `sub_` — subtask (item within a task)
- `wh_`  — webhook endpoint
- `whe_` — webhook event

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
  "project_id": "prj_xyz",
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
- Resources have a nullable `project_id` column
- Authenticated requests: set `project_id` from `auth.projectId`
- Unauthenticated requests: `project_id = null` (public resource)
- On GET/PATCH/DELETE: if resource has a `project_id`, require the request's auth to match. If `project_id = null`, allow any request.

## Route File Pattern
Each resource lives in `src/app/api/<resource>/route.ts` (collection) and `src/app/api/<resource>/[id]/route.ts` (item).

## MCP Tool Pattern
Each feature exports a `fooTools(server: McpServer): void` function from `src/lib/mcp/tools/foo.ts`.
Use `server.tool(name, description, zodSchema, handler)` — zod v4 shapes.
Tools accept an optional `api_key` param so agents can pass their key directly.
Tools should mirror the REST API operations: list, get, create, update, delete.
