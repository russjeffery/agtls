# agtools API Conventions

## Base URL
`/api/v1/`

## Authentication
- Pass `Authorization: Bearer agt_live_<key>` or `Authorization: Bearer agt_test_<key>`
- Auth is **optional** — unauthenticated requests work but resources are public (no project owner)
- `resolveAuth(request)` from `@/lib/api/middleware` returns `AuthContext | null`
- If auth header is present but invalid, return 401

## Resource IDs
Use `newId(type)` from `@/lib/api/ids` for all resource IDs. Never use raw nanoid.

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
Query params: `limit`, `after` (cursor = last item ID), `before`.
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
- On GET/PATCH/DELETE: if resource has a `project_id`, require the request's auth to match that `project_id`. If resource has `project_id = null`, allow any request (no auth needed).

## Idempotency
POST routes that create resources should accept an `Idempotency-Key` request header. Store a hash and return the same response if the same key is replayed within 24h. (Skip for v1 if complex — note it as a TODO.)

## Route File Pattern
Each resource lives in `src/app/api/v1/<resource>/route.ts` (collection) and `src/app/api/v1/<resource>/[id]/route.ts` (item).

## MCP Tool Pattern
Each feature exports a `fooTools(server: McpServer): void` function from `src/lib/mcp/tools/foo.ts`.
Use `server.tool(name, description, zodSchema, handler)` — zod v4 shapes.
Auth context is passed as a parameter to the tool handler via the MCP server's custom transport context.
Tools should mirror the REST API operations: list, get, create, update, delete.
