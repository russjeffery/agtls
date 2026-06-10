/**
 * Unit tests for:
 *   src/lib/api/serialize.ts  — serializeTask, serializeSubtask, etc.
 *   src/lib/api/response.ts   — toUnix, listResponse, errorResponse, etc.
 *   src/lib/api/errors.ts     — error builder functions
 */
import { describe, it, expect } from "vitest";
import {
  serializeTask,
  serializeSubtask,
  serializeWebhookEndpoint,
  serializeWebhookEvent,
  serializeOrganization,
  serializeApiKey,
} from "@/lib/api/serialize";
import {
  toUnix,
  listResponse,
  errorResponse,
  created,
  ok,
  noContent,
} from "@/lib/api/response";
import { errors } from "@/lib/api/errors";

// NEXT_PUBLIC_APP_URL is set to "https://app.example.com" by test/setup.ts
const APP_URL = "https://app.example.com";

// ─── toUnix ────────────────────────────────────────────────────────────────

describe("toUnix", () => {
  it("returns null for null", () => {
    expect(toUnix(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(toUnix(undefined)).toBeNull();
  });

  it("converts a date to floor(ms/1000)", () => {
    const d = new Date("2024-01-01T00:00:01.999Z");
    expect(toUnix(d)).toBe(Math.floor(d.getTime() / 1000));
  });

  it("floors — does not round up", () => {
    const d = new Date("2024-01-01T00:00:01.999Z");
    const unix = toUnix(d);
    expect(unix).toBe(1704067201); // exact value for 2024-01-01T00:00:01.999
  });
});

// ─── serializeTask ──────────────────────────────────────────────────────────

describe("serializeTask", () => {
  const now = new Date("2024-06-01T12:00:00Z");
  const row = {
    id: "tsk_abc123",
    organizationId: "org_xyz",
    name: "My Task",
    description: "do the thing",
    createdAt: now,
    updatedAt: now,
  };

  it("has object field === 'task'", () => {
    expect(serializeTask(row).object).toBe("task");
  });

  it("uses snake_case keys", () => {
    const s = serializeTask(row);
    expect(s).toHaveProperty("organization_id");
    expect(s).toHaveProperty("created_at");
    expect(s).toHaveProperty("updated_at");
    expect(s).not.toHaveProperty("organizationId");
    expect(s).not.toHaveProperty("createdAt");
  });

  it("passes through organization_id", () => {
    expect(serializeTask(row).organization_id).toBe("org_xyz");
  });

  it("converts dates to Unix timestamps", () => {
    const s = serializeTask(row);
    expect(s.created_at).toBe(toUnix(now));
    expect(s.updated_at).toBe(toUnix(now));
  });
});

// ─── serializeSubtask ──────────────────────────────────────────────────────

describe("serializeSubtask", () => {
  const now = new Date("2024-06-01T12:00:00Z");
  const baseRow = {
    id: "sub_abc",
    organizationId: "org_xyz",
    taskId: "tsk_abc",
    title: "Subtask title",
    description: null,
    status: "todo" as const,
    priority: "medium" as const,
    assignee: null,
    metadata: null,
    dueAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  it("has object field === 'subtask'", () => {
    expect(serializeSubtask(baseRow).object).toBe("subtask");
  });

  it("defaults metadata to {} when null", () => {
    expect(serializeSubtask(baseRow).metadata).toEqual({});
  });

  it("preserves metadata when present", () => {
    const row = { ...baseRow, metadata: { foo: "bar" } };
    expect(serializeSubtask(row).metadata).toEqual({ foo: "bar" });
  });

  it("converts dueAt and completedAt to Unix or null", () => {
    const s = serializeSubtask(baseRow);
    expect(s.due_at).toBeNull();
    expect(s.completed_at).toBeNull();
  });

  it("uses snake_case keys", () => {
    const s = serializeSubtask(baseRow);
    expect(s).toHaveProperty("task_id");
    expect(s).toHaveProperty("organization_id");
    expect(s).not.toHaveProperty("taskId");
  });
});

// ─── serializeWebhookEndpoint ───────────────────────────────────────────────

describe("serializeWebhookEndpoint", () => {
  const now = new Date("2024-06-01T12:00:00Z");
  const row = {
    id: "wh_endpoint1",
    organizationId: "org_xyz",
    name: "My Webhook",
    description: null,
    maxEvents: null,
    createdAt: now,
    updatedAt: now,
  };

  it("has object field === 'webhook_endpoint'", () => {
    expect(serializeWebhookEndpoint(row).object).toBe("webhook_endpoint");
  });

  it("builds url as ${NEXT_PUBLIC_APP_URL}/api/catch/<id>", () => {
    expect(serializeWebhookEndpoint(row).url).toBe(
      `${APP_URL}/api/catch/wh_endpoint1`
    );
  });

  it("defaults max_events to 100 when maxEvents is null", () => {
    expect(serializeWebhookEndpoint(row).max_events).toBe(100);
  });

  it("uses the provided maxEvents when not null", () => {
    const r = { ...row, maxEvents: 50 };
    expect(serializeWebhookEndpoint(r).max_events).toBe(50);
  });

  it("passes eventCount through as event_count", () => {
    expect(serializeWebhookEndpoint(row, 7).event_count).toBe(7);
  });

  it("event_count is undefined when not provided", () => {
    expect(serializeWebhookEndpoint(row).event_count).toBeUndefined();
  });
});

// ─── serializeWebhookEvent ─────────────────────────────────────────────────

describe("serializeWebhookEvent", () => {
  const receivedAt = new Date("2024-06-01T12:00:00Z");
  const row = {
    id: "whe_ev1",
    endpointId: "wh_endpoint1",
    organizationId: "org_xyz",
    method: "POST",
    path: "/api/catch/wh_endpoint1",
    headers: { "content-type": "application/json" },
    body: '{"hello":"world"}',
    parsedBody: { hello: "world" },
    queryParams: { foo: "bar" },
    sourceIp: "1.2.3.4",
    sizeBytes: 18,
    receivedAt,
  };

  it("has object field === 'webhook_event'", () => {
    expect(serializeWebhookEvent(row).object).toBe("webhook_event");
  });

  it("has snake_case endpoint_id", () => {
    expect(serializeWebhookEvent(row).endpoint_id).toBe("wh_endpoint1");
  });

  it("has snake_case organization_id", () => {
    expect(serializeWebhookEvent(row).organization_id).toBe("org_xyz");
  });

  it("converts receivedAt to unix", () => {
    expect(serializeWebhookEvent(row).received_at).toBe(toUnix(receivedAt));
  });
});

// ─── serializeOrganization ──────────────────────────────────────────────────────

describe("serializeOrganization", () => {
  const now = new Date("2024-06-01T12:00:00Z");
  const row = {
    id: "org_abc",
    name: "My Org",
    slug: "my-org",
    createdAt: now,
  };

  it("has object field === 'organization'", () => {
    expect(serializeOrganization(row).object).toBe("organization");
  });

  it("does not expose userId", () => {
    const s = serializeOrganization(row) as Record<string, unknown>;
    expect(s).not.toHaveProperty("userId");
    expect(s).not.toHaveProperty("user_id");
  });

  it("exposes name and slug", () => {
    const s = serializeOrganization(row);
    expect(s.name).toBe("My Org");
    expect(s.slug).toBe("my-org");
  });
});

// ─── serializeApiKey ───────────────────────────────────────────────────────

describe("serializeApiKey", () => {
  const now = new Date("2024-06-01T12:00:00Z");
  const row = {
    id: "agt_abc",
    organizationId: "org_xyz",
    name: "My Key",
    keyPrefix: "agt_abc123defghijklm",
    lastUsedAt: null,
    revokedAt: null,
    createdAt: now,
  };

  it("has object field === 'api_key'", () => {
    expect(serializeApiKey(row).object).toBe("api_key");
  });

  it("redacts the key as keyPrefix + '...'", () => {
    expect(serializeApiKey(row).key).toBe("agt_abc123defghijklm...");
  });

  it("has snake_case organization_id", () => {
    expect(serializeApiKey(row).organization_id).toBe("org_xyz");
  });

  it("converts timestamps to unix (null for null)", () => {
    const s = serializeApiKey(row);
    expect(s.last_used_at).toBeNull();
    expect(s.revoked_at).toBeNull();
    expect(s.created_at).toBe(toUnix(now));
  });
});

// ─── listResponse ──────────────────────────────────────────────────────────

describe("listResponse", () => {
  it("shape: object=list, data, has_more, next_cursor", async () => {
    const res = listResponse([{ id: "1", object: "task", created_at: 0 }], false, null);
    const body = await res.json();
    expect(body.object).toBe("list");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.has_more).toBe(false);
    expect(body.next_cursor).toBeNull();
  });

  it("includes total_count when provided", async () => {
    const res = listResponse([], false, null, 42);
    const body = await res.json();
    expect(body.total_count).toBe(42);
  });

  it("omits total_count when not provided", async () => {
    const res = listResponse([], false, null);
    const body = await res.json();
    expect(body).not.toHaveProperty("total_count");
  });

  it("passes next_cursor through", async () => {
    const res = listResponse([], true, "cursor_xyz");
    const body = await res.json();
    expect(body.next_cursor).toBe("cursor_xyz");
    expect(body.has_more).toBe(true);
  });
});

// ─── errorResponse ─────────────────────────────────────────────────────────

describe("errorResponse", () => {
  it("nests the error object under 'error'", async () => {
    const err = errors.notFound("task", "tsk_123");
    const res = errorResponse(err, 404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error.type).toBe("not_found_error");
    expect(body.error.code).toBe("resource_not_found");
  });

  it("uses the provided status code", async () => {
    const res = errorResponse(errors.internal(), 500);
    expect(res.status).toBe(500);
  });

  it("sets WWW-Authenticate header with PRM URL on 401", async () => {
    const res = errorResponse(errors.unauthorized(), 401);
    const header = res.headers.get("WWW-Authenticate");
    expect(header).not.toBeNull();
    expect(header).toContain(
      `${APP_URL}/.well-known/oauth-protected-resource`
    );
  });

  it("does not set WWW-Authenticate on non-401", async () => {
    const res = errorResponse(errors.forbidden(), 403);
    expect(res.headers.get("WWW-Authenticate")).toBeNull();
  });
});

// ─── created / ok / noContent ──────────────────────────────────────────────

describe("created", () => {
  it("returns status 201", async () => {
    const res = created({ id: "abc" });
    expect(res.status).toBe(201);
  });

  it("returns the data as JSON", async () => {
    const res = created({ id: "abc", object: "task" });
    const body = await res.json();
    expect(body.id).toBe("abc");
  });
});

describe("ok", () => {
  it("defaults to status 200", async () => {
    const res = ok({ id: "abc" });
    expect(res.status).toBe(200);
  });

  it("can override status", async () => {
    const res = ok({ id: "abc" }, 202);
    expect(res.status).toBe(202);
  });
});

describe("noContent", () => {
  it("returns status 204", () => {
    const res = noContent();
    expect(res.status).toBe(204);
  });

  it("returns no body", async () => {
    const res = noContent();
    const text = await res.text();
    expect(text).toBe("");
  });
});

// ─── errors.ts ─────────────────────────────────────────────────────────────

describe("errors.unauthorized", () => {
  it("returns type authentication_error, code unauthorized", () => {
    const e = errors.unauthorized();
    expect(e.type).toBe("authentication_error");
    expect(e.code).toBe("unauthorized");
  });

  it("allows custom message", () => {
    const e = errors.unauthorized("No key");
    expect(e.message).toBe("No key");
  });
});

describe("errors.forbidden", () => {
  it("returns type authorization_error, code forbidden", () => {
    const e = errors.forbidden();
    expect(e.type).toBe("authorization_error");
    expect(e.code).toBe("forbidden");
  });
});

describe("errors.notFound", () => {
  it("returns type not_found_error, code resource_not_found", () => {
    const e = errors.notFound("task", "tsk_abc");
    expect(e.type).toBe("not_found_error");
    expect(e.code).toBe("resource_not_found");
  });

  it("interpolates resource and id into the message", () => {
    const e = errors.notFound("widget", "wgt_123");
    expect(e.message).toContain("widget");
    expect(e.message).toContain("wgt_123");
  });
});

describe("errors.invalidParam", () => {
  it("returns type invalid_request_error, code invalid_param", () => {
    const e = errors.invalidParam("name", "too long");
    expect(e.type).toBe("invalid_request_error");
    expect(e.code).toBe("invalid_param");
  });

  it("sets param field", () => {
    const e = errors.invalidParam("slug", "invalid slug");
    expect(e.param).toBe("slug");
  });

  it("uses the provided message", () => {
    const e = errors.invalidParam("name", "too long");
    expect(e.message).toBe("too long");
  });
});

describe("errors.missingParam", () => {
  it("returns type invalid_request_error, code missing_required_param", () => {
    const e = errors.missingParam("name");
    expect(e.type).toBe("invalid_request_error");
    expect(e.code).toBe("missing_required_param");
  });

  it("sets param field", () => {
    const e = errors.missingParam("email");
    expect(e.param).toBe("email");
  });

  it("interpolates param name into message", () => {
    const e = errors.missingParam("description");
    expect(e.message).toContain("description");
  });
});

describe("errors.internal", () => {
  it("returns type api_error, code internal_error", () => {
    const e = errors.internal();
    expect(e.type).toBe("api_error");
    expect(e.code).toBe("internal_error");
  });

  it("allows custom message", () => {
    const e = errors.internal("DB went boom");
    expect(e.message).toBe("DB went boom");
  });
});
