import { describe, it, expect } from "vitest";
import { makeRequest, json, routeParams } from "../helpers/request";
import { seedOrganization } from "../helpers/seed";
import { testDb } from "../helpers/db";
import { subtask as subtaskTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ─── Subtasks collection ─────────────────────────────────────────────────────

describe("GET /api/subtasks", () => {
  it("returns empty list for a new organization", async () => {
    const { GET } = await import("@/app/api/subtasks/route");
    const { key } = await seedOrganization();

    const res = await GET(makeRequest("/api/subtasks", { token: key }));
    expect(res.status).toBe(200);
    const body = await json<{ object: string; data: unknown[]; has_more: boolean; next_cursor: unknown }>(res);
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(0);
    expect(body.has_more).toBe(false);
    expect(body.next_cursor).toBeNull();
  });

  it("returns 401 for invalid token", async () => {
    const { GET } = await import("@/app/api/subtasks/route");
    const res = await GET(makeRequest("/api/subtasks", { token: "garbage" }));
    expect(res.status).toBe(401);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("authentication_error");
  });

  it("returns 401 for expired key", async () => {
    const { GET } = await import("@/app/api/subtasks/route");
    const { key } = await seedOrganization({ expiresAt: new Date(Date.now() - 1000) });
    const res = await GET(makeRequest("/api/subtasks", { token: key }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid status filter", async () => {
    const { GET } = await import("@/app/api/subtasks/route");
    const res = await GET(makeRequest("/api/subtasks?status=invalid_status"));
    expect(res.status).toBe(400);
    const body = await json<{ error: { type: string; code: string; param: string } }>(res);
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.param).toBe("status");
  });

  it("returns 400 for invalid priority filter", async () => {
    const { GET } = await import("@/app/api/subtasks/route");
    const res = await GET(makeRequest("/api/subtasks?priority=critical"));
    expect(res.status).toBe(400);
    const body = await json<{ error: { type: string; param: string } }>(res);
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.param).toBe("priority");
  });

  it("filters by status", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { GET } = await import("@/app/api/subtasks/route");
    const { key } = await seedOrganization();

    await POST(makeRequest("/api/subtasks", { body: { title: "Todo sub", status: "todo" }, token: key }));
    await POST(makeRequest("/api/subtasks", { body: { title: "Done sub", status: "done" }, token: key }));

    const res = await GET(makeRequest("/api/subtasks?status=todo", { token: key }));
    expect(res.status).toBe(200);
    const body = await json<{ data: { title: string; status: string }[] }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].status).toBe("todo");
    expect(body.data[0].title).toBe("Todo sub");
  });

  it("filters by priority", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { GET } = await import("@/app/api/subtasks/route");
    const { key } = await seedOrganization();

    await POST(makeRequest("/api/subtasks", { body: { title: "Urgent sub", priority: "urgent" }, token: key }));
    await POST(makeRequest("/api/subtasks", { body: { title: "Low sub", priority: "low" }, token: key }));

    const res = await GET(makeRequest("/api/subtasks?priority=urgent", { token: key }));
    const body = await json<{ data: { priority: string }[] }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].priority).toBe("urgent");
  });

  it("filters by assignee", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { GET } = await import("@/app/api/subtasks/route");
    const { key } = await seedOrganization();

    await POST(makeRequest("/api/subtasks", { body: { title: "Alice sub", assignee: "alice" }, token: key }));
    await POST(makeRequest("/api/subtasks", { body: { title: "Bob sub", assignee: "bob" }, token: key }));

    const res = await GET(makeRequest("/api/subtasks?assignee=alice", { token: key }));
    const body = await json<{ data: { assignee: string }[] }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].assignee).toBe("alice");
  });

  it("filters by task_id", async () => {
    const { POST: taskPost } = await import("@/app/api/tasks/route");
    const { POST, GET } = await import("@/app/api/subtasks/route");
    const { key } = await seedOrganization();

    const t1 = await taskPost(makeRequest("/api/tasks", { body: { name: "Task 1" }, token: key }));
    const { id: taskId1 } = await json<{ id: string }>(t1);
    const t2 = await taskPost(makeRequest("/api/tasks", { body: { name: "Task 2" }, token: key }));
    const { id: taskId2 } = await json<{ id: string }>(t2);

    await POST(makeRequest("/api/subtasks", { body: { title: "In T1", task_id: taskId1 }, token: key }));
    await POST(makeRequest("/api/subtasks", { body: { title: "In T2", task_id: taskId2 }, token: key }));

    const res = await GET(makeRequest(`/api/subtasks?task_id=${taskId1}`, { token: key }));
    const body = await json<{ data: { task_id: string }[] }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].task_id).toBe(taskId1);
  });

  it("isolates owned subtasks between organizations", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { GET } = await import("@/app/api/subtasks/route");
    const a = await seedOrganization();
    const b = await seedOrganization();

    await POST(makeRequest("/api/subtasks", { body: { title: "A sub" }, token: a.key }));
    const res = await GET(makeRequest("/api/subtasks", { token: b.key }));
    const body = await json<{ data: unknown[] }>(res);
    expect(body.data).toHaveLength(0);
  });

  it("does not return owned subtasks to unauthenticated requests", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { GET } = await import("@/app/api/subtasks/route");
    const { key } = await seedOrganization();

    await POST(makeRequest("/api/subtasks", { body: { title: "Private" }, token: key }));
    const res = await GET(makeRequest("/api/subtasks"));
    const body = await json<{ data: unknown[] }>(res);
    expect(body.data).toHaveLength(0);
  });

  it("does not enumerate public subtasks to unauthenticated requests", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { GET } = await import("@/app/api/subtasks/route");

    // Public resources stay reachable by ID but are never enumerable.
    await POST(makeRequest("/api/subtasks", { body: { title: "Public sub" } }));
    const res = await GET(makeRequest("/api/subtasks"));
    const body = await json<{ data: unknown[] }>(res);
    expect(body.data).toHaveLength(0);
  });

  it("serves HTML when Accept: text/html", async () => {
    const { GET } = await import("@/app/api/subtasks/route");
    const res = await GET(makeRequest("/api/subtasks", { accept: "text/html,application/xhtml+xml" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html");
  });
});

describe("POST /api/subtasks", () => {
  it("creates a public subtask without auth", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", { body: { title: "Public sub" } }));
    expect(res.status).toBe(201);
    const body = await json<{ id: string; object: string; organization_id: unknown; title: string }>(res);
    expect(body.id).toMatch(/^sub_/);
    expect(body.object).toBe("subtask");
    expect(body.organization_id).toBeNull();
    expect(body.title).toBe("Public sub");
  });

  it("creates an owned subtask with auth", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { key, organizationId } = await seedOrganization();

    const res = await POST(makeRequest("/api/subtasks", { body: { title: "Owned sub" }, token: key }));
    expect(res.status).toBe(201);
    const body = await json<{ organization_id: string }>(res);
    expect(body.organization_id).toBe(organizationId);
  });

  it("returns 400 when title is missing", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", { body: {} }));
    expect(res.status).toBe(400);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("returns 400 when title is empty", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", { body: { title: "" } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when title exceeds 500 chars", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", { body: { title: "x".repeat(501) } }));
    expect(res.status).toBe(400);
  });

  it("accepts title at exactly 500 chars", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", { body: { title: "x".repeat(500) } }));
    expect(res.status).toBe(201);
  });

  it("returns 404 when task_id references non-existent task", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", { body: { title: "Sub", task_id: "tsk_missing" } }));
    expect(res.status).toBe(404);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("not_found_error");
  });

  it("returns 403 when task_id belongs to another organization", async () => {
    const { POST: taskPost } = await import("@/app/api/tasks/route");
    const { POST } = await import("@/app/api/subtasks/route");
    const a = await seedOrganization();
    const b = await seedOrganization();

    const taskRes = await taskPost(makeRequest("/api/tasks", { body: { name: "A's task" }, token: a.key }));
    const { id: taskId } = await json<{ id: string }>(taskRes);

    const res = await POST(makeRequest("/api/subtasks", {
      body: { title: "Sub", task_id: taskId },
      token: b.key,
    }));
    expect(res.status).toBe(403);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("authorization_error");
  });

  it("converts due_at unix seconds to Date correctly", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const dueUnix = 1700000000;
    const res = await POST(makeRequest("/api/subtasks", { body: { title: "Due sub", due_at: dueUnix } }));
    expect(res.status).toBe(201);
    const body = await json<{ due_at: number }>(res);
    expect(body.due_at).toBe(dueUnix);
  });

  it("defaults metadata to empty object", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", { body: { title: "Meta default" } }));
    expect(res.status).toBe(201);
    const body = await json<{ metadata: Record<string, unknown> }>(res);
    expect(body.metadata).toEqual({});
  });

  it("stores custom metadata", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", {
      body: { title: "Meta sub", metadata: { tag: "test", count: 42 } },
    }));
    expect(res.status).toBe(201);
    const body = await json<{ metadata: Record<string, unknown> }>(res);
    expect(body.metadata).toEqual({ tag: "test", count: 42 });
  });

  it("defaults status to todo and priority to medium", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", { body: { title: "Defaults" } }));
    expect(res.status).toBe(201);
    const body = await json<{ status: string; priority: string }>(res);
    expect(body.status).toBe("todo");
    expect(body.priority).toBe("medium");
  });

  it("returns 401 for invalid token", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", { body: { title: "Sub" }, token: "bad" }));
    expect(res.status).toBe(401);
  });

  it("redirects to subtask page with text/html on POST", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", {
      body: { title: "HTML sub" },
      accept: "text/html,application/xhtml+xml",
    }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/api\/subtasks\/sub_/);
  });
});

// ─── Subtasks item ───────────────────────────────────────────────────────────

describe("GET /api/subtasks/[id]", () => {
  it("returns a subtask by ID", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { GET } = await import("@/app/api/subtasks/[id]/route");

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "My sub" } }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(makeRequest(`/api/subtasks/${id}`), routeParams({ id }));
    expect(res.status).toBe(200);
    const body = await json<{ id: string; object: string; title: string }>(res);
    expect(body.id).toBe(id);
    expect(body.object).toBe("subtask");
    expect(body.title).toBe("My sub");
  });

  it("returns 404 for non-existent subtask", async () => {
    const { GET } = await import("@/app/api/subtasks/[id]/route");
    const res = await GET(makeRequest("/api/subtasks/sub_none"), routeParams({ id: "sub_none" }));
    expect(res.status).toBe(404);
    const body = await json<{ error: { type: string; code: string } }>(res);
    expect(body.error.type).toBe("not_found_error");
    expect(body.error.code).toBe("resource_not_found");
  });

  it("returns 403 when another organization accesses owned subtask", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { GET } = await import("@/app/api/subtasks/[id]/route");
    const a = await seedOrganization();
    const b = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "A's" }, token: a.key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(makeRequest(`/api/subtasks/${id}`, { token: b.key }), routeParams({ id }));
    expect(res.status).toBe(403);
  });

  it("returns 401 for invalid token", async () => {
    const { GET } = await import("@/app/api/subtasks/[id]/route");
    const res = await GET(makeRequest("/api/subtasks/sub_any", { token: "bad" }), routeParams({ id: "sub_any" }));
    expect(res.status).toBe(401);
  });

  it("serves HTML when Accept: text/html", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { GET } = await import("@/app/api/subtasks/[id]/route");

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "HTML sub" } }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(
      makeRequest(`/api/subtasks/${id}`, { accept: "text/html,application/xhtml+xml" }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html");
  });
});

describe("PATCH /api/subtasks/[id]", () => {
  it("updates subtask title", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "Original" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/subtasks/${id}`, { method: "PATCH", body: { title: "Updated" }, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    const body = await json<{ title: string }>(res);
    expect(body.title).toBe("Updated");
  });

  it("transitions status to done sets completed_at", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "ToDo" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/subtasks/${id}`, { method: "PATCH", body: { status: "done" }, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    const body = await json<{ status: string; completed_at: number | null }>(res);
    expect(body.status).toBe("done");
    expect(body.completed_at).not.toBeNull();
    expect(typeof body.completed_at).toBe("number");
  });

  it("transitions from done to other status clears completed_at", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    // Create as done
    const createRes = await POST(makeRequest("/api/subtasks", {
      body: { title: "Done sub", status: "done" },
      token: key,
    }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/subtasks/${id}`, { method: "PATCH", body: { status: "todo" }, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    const body = await json<{ status: string; completed_at: number | null }>(res);
    expect(body.status).toBe("todo");
    expect(body.completed_at).toBeNull();
  });

  it("updates priority", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "Sub" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/subtasks/${id}`, { method: "PATCH", body: { priority: "urgent" }, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    const body = await json<{ priority: string }>(res);
    expect(body.priority).toBe("urgent");
  });

  it("updates assignee", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "Sub" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/subtasks/${id}`, { method: "PATCH", body: { assignee: "charlie" }, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    const body = await json<{ assignee: string }>(res);
    expect(body.assignee).toBe("charlie");
  });

  it("updates due_at (unix seconds to date conversion)", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "Sub" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const dueUnix = 1750000000;
    const res = await PATCH(
      makeRequest(`/api/subtasks/${id}`, { method: "PATCH", body: { due_at: dueUnix }, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    const body = await json<{ due_at: number }>(res);
    expect(body.due_at).toBe(dueUnix);
  });

  it("clears due_at when set to null", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", {
      body: { title: "Sub", due_at: 1750000000 },
      token: key,
    }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/subtasks/${id}`, { method: "PATCH", body: { due_at: null }, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    const body = await json<{ due_at: number | null }>(res);
    expect(body.due_at).toBeNull();
  });

  it("returns 404 for non-existent subtask", async () => {
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const res = await PATCH(
      makeRequest("/api/subtasks/sub_none", { method: "PATCH", body: { title: "x" } }),
      routeParams({ id: "sub_none" })
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for cross-organization patch", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const a = await seedOrganization();
    const b = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "A sub" }, token: a.key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/subtasks/${id}`, { method: "PATCH", body: { title: "Hacked" }, token: b.key }),
      routeParams({ id })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid patch body (empty title)", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "Sub" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/subtasks/${id}`, { method: "PATCH", body: { title: "" }, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(400);
  });

  it("redirects after PATCH with text/html Accept", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "Sub" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/subtasks/${id}`, {
        method: "PATCH",
        body: { title: "Updated" },
        token: key,
        accept: "text/html,application/xhtml+xml",
      }),
      routeParams({ id })
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain(`/api/subtasks/${id}`);
  });

  it("persists changes in DB", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { PATCH } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "Before" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    await PATCH(
      makeRequest(`/api/subtasks/${id}`, { method: "PATCH", body: { title: "After" }, token: key }),
      routeParams({ id })
    );

    const [row] = await testDb.select().from(subtaskTable).where(eq(subtaskTable.id, id));
    expect(row.title).toBe("After");
  });
});

describe("DELETE /api/subtasks/[id]", () => {
  it("deletes a subtask and returns 204", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { DELETE } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "ToDelete" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await DELETE(
      makeRequest(`/api/subtasks/${id}`, { method: "DELETE", token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(204);

    const rows = await testDb.select().from(subtaskTable).where(eq(subtaskTable.id, id));
    expect(rows).toHaveLength(0);
  });

  it("returns 404 for non-existent subtask", async () => {
    const { DELETE } = await import("@/app/api/subtasks/[id]/route");
    const res = await DELETE(
      makeRequest("/api/subtasks/sub_ghost", { method: "DELETE" }),
      routeParams({ id: "sub_ghost" })
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for cross-organization delete", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { DELETE } = await import("@/app/api/subtasks/[id]/route");
    const a = await seedOrganization();
    const b = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "A sub" }, token: a.key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await DELETE(
      makeRequest(`/api/subtasks/${id}`, { method: "DELETE", token: b.key }),
      routeParams({ id })
    );
    expect(res.status).toBe(403);

    const rows = await testDb.select().from(subtaskTable).where(eq(subtaskTable.id, id));
    expect(rows).toHaveLength(1);
  });

  it("deletes a public subtask without auth", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { DELETE } = await import("@/app/api/subtasks/[id]/route");

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "Public sub" } }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await DELETE(
      makeRequest(`/api/subtasks/${id}`, { method: "DELETE" }),
      routeParams({ id })
    );
    expect(res.status).toBe(204);
  });

  it("redirects after DELETE with text/html Accept", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const { DELETE } = await import("@/app/api/subtasks/[id]/route");
    const { key } = await seedOrganization();

    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "Sub" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await DELETE(
      makeRequest(`/api/subtasks/${id}`, {
        method: "DELETE",
        token: key,
        accept: "text/html,application/xhtml+xml",
      }),
      routeParams({ id })
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/api/subtasks");
  });
});
