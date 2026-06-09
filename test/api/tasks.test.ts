import { describe, it, expect } from "vitest";
import { makeRequest, json, routeParams } from "../helpers/request";
import { seedProject } from "../helpers/seed";
import { testDb } from "../helpers/db";
import { task as taskTable, subtask as subtaskTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ─── Tasks collection ────────────────────────────────────────────────────────

describe("GET /api/tasks", () => {
  it("returns empty list for a new project", async () => {
    const { GET } = await import("@/app/api/tasks/route");
    const { key } = await seedProject();

    const res = await GET(makeRequest("/api/tasks", { token: key }));
    expect(res.status).toBe(200);
    const body = await json<{ object: string; data: unknown[]; has_more: boolean; next_cursor: unknown }>(res);
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(0);
    expect(body.has_more).toBe(false);
    expect(body.next_cursor).toBeNull();
  });

  it("returns empty list for unauthenticated (public) context", async () => {
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeRequest("/api/tasks"));
    expect(res.status).toBe(200);
    const body = await json<{ object: string; data: unknown[] }>(res);
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(0);
  });

  it("returns 401 for invalid/garbage token", async () => {
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeRequest("/api/tasks", { token: "garbage_token" }));
    expect(res.status).toBe(401);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("authentication_error");
  });

  it("returns 401 for expired key", async () => {
    const { GET } = await import("@/app/api/tasks/route");
    const { key } = await seedProject({ expiresAt: new Date(Date.now() - 1000) });
    const res = await GET(makeRequest("/api/tasks", { token: key }));
    expect(res.status).toBe(401);
  });

  it("isolates owned tasks between projects", async () => {
    const { POST, GET } = await import("@/app/api/tasks/route");
    const a = await seedProject();
    const b = await seedProject();

    await POST(makeRequest("/api/tasks", { body: { name: "Task A" }, token: a.key }));
    const res = await GET(makeRequest("/api/tasks", { token: b.key }));
    const body = await json<{ data: unknown[] }>(res);
    expect(body.data).toHaveLength(0);
  });

  it("does not return owned tasks to unauthenticated requests", async () => {
    const { POST, GET } = await import("@/app/api/tasks/route");
    const { key } = await seedProject();

    await POST(makeRequest("/api/tasks", { body: { name: "Owned" }, token: key }));
    const res = await GET(makeRequest("/api/tasks"));
    const body = await json<{ data: unknown[] }>(res);
    expect(body.data).toHaveLength(0);
  });

  it("returns public tasks to unauthenticated requests", async () => {
    const { POST, GET } = await import("@/app/api/tasks/route");

    await POST(makeRequest("/api/tasks", { body: { name: "Public" } }));
    const res = await GET(makeRequest("/api/tasks"));
    const body = await json<{ data: { name: string }[] }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Public");
  });

  it("clamps limit to max 100", async () => {
    const { GET } = await import("@/app/api/tasks/route");
    // Should not throw; just returns up to 100 items
    const res = await GET(makeRequest("/api/tasks?limit=9999"));
    expect(res.status).toBe(200);
  });

  it("clamps limit to minimum 1", async () => {
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeRequest("/api/tasks?limit=0"));
    expect(res.status).toBe(200);
  });

  it("returns has_more and next_cursor when there are more items", async () => {
    const { POST, GET } = await import("@/app/api/tasks/route");
    const { key } = await seedProject();

    // Create 3 tasks, request limit=2
    for (let i = 0; i < 3; i++) {
      await POST(makeRequest("/api/tasks", { body: { name: `Task ${i}` }, token: key }));
    }

    const res = await GET(makeRequest("/api/tasks?limit=2", { token: key }));
    const body = await json<{ data: { id: string }[]; has_more: boolean; next_cursor: string | null }>(res);
    expect(body.data).toHaveLength(2);
    expect(body.has_more).toBe(true);
    expect(body.next_cursor).toBe(body.data[body.data.length - 1].id);
  });

  it("paginates with after cursor", async () => {
    const { POST, GET } = await import("@/app/api/tasks/route");
    const { key } = await seedProject();

    // Create 3 tasks with slightly different timestamps
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await POST(makeRequest("/api/tasks", { body: { name: `Paged ${i}` }, token: key }));
      const t = await json<{ id: string }>(r);
      ids.push(t.id);
    }

    // First page: limit=2
    const page1 = await GET(makeRequest("/api/tasks?limit=2", { token: key }));
    const body1 = await json<{ data: { id: string }[]; has_more: boolean; next_cursor: string }>(page1);
    expect(body1.data).toHaveLength(2);
    expect(body1.has_more).toBe(true);

    // Second page using cursor
    const page2 = await GET(makeRequest(`/api/tasks?limit=2&after=${body1.next_cursor}`, { token: key }));
    const body2 = await json<{ data: { id: string }[]; has_more: boolean }>(page2);
    expect(body2.data.length).toBeGreaterThanOrEqual(1);
    expect(body2.has_more).toBe(false);

    // No overlap between pages
    const page1Ids = body1.data.map((d) => d.id);
    const page2Ids = body2.data.map((d) => d.id);
    expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
  });

  it("serves HTML when Accept: text/html", async () => {
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeRequest("/api/tasks", { accept: "text/html,application/xhtml+xml" }));
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html");
  });
});

describe("POST /api/tasks", () => {
  it("creates a public task without auth", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makeRequest("/api/tasks", { body: { name: "Public task" } }));
    expect(res.status).toBe(201);
    const body = await json<{ id: string; object: string; project_id: unknown; name: string }>(res);
    expect(body.id).toMatch(/^tsk_/);
    expect(body.object).toBe("task");
    expect(body.project_id).toBeNull();
    expect(body.name).toBe("Public task");
  });

  it("creates an owned task with auth", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { key, projectId } = await seedProject();

    const res = await POST(makeRequest("/api/tasks", { body: { name: "Owned task" }, token: key }));
    expect(res.status).toBe(201);
    const body = await json<{ id: string; project_id: string; name: string }>(res);
    expect(body.project_id).toBe(projectId);
  });

  it("returns 401 for invalid token", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makeRequest("/api/tasks", { body: { name: "Fail" }, token: "invalid" }));
    expect(res.status).toBe(401);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("authentication_error");
  });

  it("returns 401 for expired key", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { key } = await seedProject({ expiresAt: new Date(Date.now() - 1000) });
    const res = await POST(makeRequest("/api/tasks", { body: { name: "Fail" }, token: key }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makeRequest("/api/tasks", { body: {} }));
    expect(res.status).toBe(400);
    const body = await json<{ error: { type: string; code: string; param: string } }>(res);
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.param).toBe("body");
  });

  it("returns 400 when name is empty string", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makeRequest("/api/tasks", { body: { name: "" } }));
    expect(res.status).toBe(400);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("returns 400 when name exceeds 200 chars", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makeRequest("/api/tasks", { body: { name: "x".repeat(201) } }));
    expect(res.status).toBe(400);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("accepts name at exactly 200 chars", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makeRequest("/api/tasks", { body: { name: "x".repeat(200) } }));
    expect(res.status).toBe(201);
  });

  it("accepts optional description", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makeRequest("/api/tasks", { body: { name: "With desc", description: "Hello" } }));
    expect(res.status).toBe(201);
    const body = await json<{ description: string }>(res);
    expect(body.description).toBe("Hello");
  });

  it("returns resource object shape with unix timestamps", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makeRequest("/api/tasks", { body: { name: "Shape check" } }));
    const body = await json<{ created_at: number; updated_at: number }>(res);
    expect(typeof body.created_at).toBe("number");
    expect(typeof body.updated_at).toBe("number");
  });

  it("redirects to task page with HTML Accept after POST", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const res = await POST(makeRequest("/api/tasks", {
      body: { name: "HTML Post" },
      accept: "text/html,application/xhtml+xml",
    }));
    expect(res.status).toBe(303);
    const location = res.headers.get("location") ?? "";
    expect(location).toMatch(/\/api\/tasks\/tsk_/);
  });
});

// ─── Tasks item ─────────────────────────────────────────────────────────────

describe("GET /api/tasks/[id]", () => {
  it("returns a public task by ID", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { GET } = await import("@/app/api/tasks/[id]/route");

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Public" } }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(makeRequest(`/api/tasks/${id}`), routeParams({ id }));
    expect(res.status).toBe(200);
    const body = await json<{ id: string; object: string; name: string }>(res);
    expect(body.id).toBe(id);
    expect(body.object).toBe("task");
    expect(body.name).toBe("Public");
  });

  it("returns an owned task to the owning project", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const { key } = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Mine" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(makeRequest(`/api/tasks/${id}`, { token: key }), routeParams({ id }));
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent task", async () => {
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const res = await GET(makeRequest("/api/tasks/tsk_nonexistent"), routeParams({ id: "tsk_nonexistent" }));
    expect(res.status).toBe(404);
    const body = await json<{ error: { type: string; code: string } }>(res);
    expect(body.error.type).toBe("not_found_error");
    expect(body.error.code).toBe("resource_not_found");
  });

  it("returns 403 when another project accesses an owned task", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const a = await seedProject();
    const b = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "A's task" }, token: a.key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(makeRequest(`/api/tasks/${id}`, { token: b.key }), routeParams({ id }));
    expect(res.status).toBe(403);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("authorization_error");
  });

  it("returns 403 when unauthenticated request accesses owned task", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const { key } = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Private" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(makeRequest(`/api/tasks/${id}`), routeParams({ id }));
    expect(res.status).toBe(403);
  });

  it("returns 401 for invalid token", async () => {
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const res = await GET(makeRequest("/api/tasks/tsk_any", { token: "bad" }), routeParams({ id: "tsk_any" }));
    expect(res.status).toBe(401);
  });

  it("serves HTML when Accept: text/html", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { GET } = await import("@/app/api/tasks/[id]/route");

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "HTML task" } }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(
      makeRequest(`/api/tasks/${id}`, { accept: "text/html,application/xhtml+xml" }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html");
  });
});

describe("PATCH /api/tasks/[id]", () => {
  it("updates task name", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const { key } = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Original" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/tasks/${id}`, { method: "PATCH", body: { name: "Updated" }, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    const body = await json<{ name: string }>(res);
    expect(body.name).toBe("Updated");
  });

  it("updates task description", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const { key } = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Task" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/tasks/${id}`, { method: "PATCH", body: { description: "New desc" }, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    const body = await json<{ description: string }>(res);
    expect(body.description).toBe("New desc");
  });

  it("returns 404 for non-existent task", async () => {
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const res = await PATCH(
      makeRequest("/api/tasks/tsk_none", { method: "PATCH", body: { name: "x" } }),
      routeParams({ id: "tsk_none" })
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for cross-project access", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const a = await seedProject();
    const b = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "A task" }, token: a.key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/tasks/${id}`, { method: "PATCH", body: { name: "Hacked" }, token: b.key }),
      routeParams({ id })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid patch body", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const { key } = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Task" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/tasks/${id}`, { method: "PATCH", body: { name: "" }, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(400);
  });

  it("redirects after PATCH when Accept: text/html", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const { key } = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Task" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await PATCH(
      makeRequest(`/api/tasks/${id}`, {
        method: "PATCH",
        body: { name: "New Name" },
        token: key,
        accept: "text/html,application/xhtml+xml",
      }),
      routeParams({ id })
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain(`/api/tasks/${id}`);
  });

  it("persists changes in DB", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { PATCH } = await import("@/app/api/tasks/[id]/route");
    const { key } = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Before" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    await PATCH(
      makeRequest(`/api/tasks/${id}`, { method: "PATCH", body: { name: "After" }, token: key }),
      routeParams({ id })
    );

    const [row] = await testDb.select().from(taskTable).where(eq(taskTable.id, id));
    expect(row.name).toBe("After");
  });
});

describe("DELETE /api/tasks/[id]", () => {
  it("deletes a task and returns 204", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const { key } = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "ToDelete" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await DELETE(
      makeRequest(`/api/tasks/${id}`, { method: "DELETE", token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(204);

    // Confirm deleted in DB
    const rows = await testDb.select().from(taskTable).where(eq(taskTable.id, id));
    expect(rows).toHaveLength(0);
  });

  it("returns 404 when task does not exist", async () => {
    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const res = await DELETE(
      makeRequest("/api/tasks/tsk_ghost", { method: "DELETE" }),
      routeParams({ id: "tsk_ghost" })
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for cross-project delete", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const a = await seedProject();
    const b = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "A task" }, token: a.key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await DELETE(
      makeRequest(`/api/tasks/${id}`, { method: "DELETE", token: b.key }),
      routeParams({ id })
    );
    expect(res.status).toBe(403);

    // Confirm NOT deleted in DB
    const rows = await testDb.select().from(taskTable).where(eq(taskTable.id, id));
    expect(rows).toHaveLength(1);
  });

  it("redirects after DELETE when Accept: text/html", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { DELETE } = await import("@/app/api/tasks/[id]/route");
    const { key } = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Task" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await DELETE(
      makeRequest(`/api/tasks/${id}`, {
        method: "DELETE",
        token: key,
        accept: "text/html,application/xhtml+xml",
      }),
      routeParams({ id })
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/api/tasks");
  });

  it("deletes a public task without auth", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { DELETE } = await import("@/app/api/tasks/[id]/route");

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Public task" } }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await DELETE(
      makeRequest(`/api/tasks/${id}`, { method: "DELETE" }),
      routeParams({ id })
    );
    expect(res.status).toBe(204);
  });
});

// ─── Tasks nested subtasks ───────────────────────────────────────────────────

describe("GET /api/tasks/[id]/subtasks", () => {
  it("returns empty subtask list for a new task", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { GET } = await import("@/app/api/tasks/[id]/subtasks/route");
    const { key } = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Task" }, token: key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(makeRequest(`/api/tasks/${id}/subtasks`, { token: key }), routeParams({ id }));
    expect(res.status).toBe(200);
    const body = await json<{ object: string; data: unknown[] }>(res);
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(0);
  });

  it("returns 404 for non-existent parent task", async () => {
    const { GET } = await import("@/app/api/tasks/[id]/subtasks/route");
    const res = await GET(makeRequest("/api/tasks/tsk_none/subtasks"), routeParams({ id: "tsk_none" }));
    expect(res.status).toBe(404);
  });

  it("returns 403 for owned task accessed by wrong project", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { GET } = await import("@/app/api/tasks/[id]/subtasks/route");
    const a = await seedProject();
    const b = await seedProject();

    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "A task" }, token: a.key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(makeRequest(`/api/tasks/${id}/subtasks`, { token: b.key }), routeParams({ id }));
    expect(res.status).toBe(403);
  });

  it("returns 401 for invalid token", async () => {
    const { GET } = await import("@/app/api/tasks/[id]/subtasks/route");
    const res = await GET(makeRequest("/api/tasks/tsk_any/subtasks", { token: "bad" }), routeParams({ id: "tsk_any" }));
    expect(res.status).toBe(401);
  });

  it("lists subtasks created under a task", async () => {
    const { POST: taskPost } = await import("@/app/api/tasks/route");
    const { GET: subtasksGet, POST: subtaskPost } = await import("@/app/api/tasks/[id]/subtasks/route");
    const { key } = await seedProject();

    const taskRes = await taskPost(makeRequest("/api/tasks", { body: { name: "Parent" }, token: key }));
    const { id: taskId } = await json<{ id: string }>(taskRes);

    await subtaskPost(
      makeRequest(`/api/tasks/${taskId}/subtasks`, { body: { title: "Sub 1" }, token: key }),
      routeParams({ id: taskId })
    );
    await subtaskPost(
      makeRequest(`/api/tasks/${taskId}/subtasks`, { body: { title: "Sub 2" }, token: key }),
      routeParams({ id: taskId })
    );

    const res = await subtasksGet(makeRequest(`/api/tasks/${taskId}/subtasks`, { token: key }), routeParams({ id: taskId }));
    expect(res.status).toBe(200);
    const body = await json<{ data: { title: string }[] }>(res);
    expect(body.data).toHaveLength(2);
    const titles = body.data.map((s) => s.title);
    expect(titles).toContain("Sub 1");
    expect(titles).toContain("Sub 2");
  });

  it("serves HTML for subtask list", async () => {
    const { POST: taskPost } = await import("@/app/api/tasks/route");
    const { GET: subtasksGet } = await import("@/app/api/tasks/[id]/subtasks/route");
    const { key } = await seedProject();

    const taskRes = await taskPost(makeRequest("/api/tasks", { body: { name: "Task" }, token: key }));
    const { id } = await json<{ id: string }>(taskRes);

    const res = await subtasksGet(
      makeRequest(`/api/tasks/${id}/subtasks`, { accept: "text/html,application/xhtml+xml", token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/html");
  });
});

describe("POST /api/tasks/[id]/subtasks", () => {
  it("creates a subtask under a task", async () => {
    const { POST: taskPost } = await import("@/app/api/tasks/route");
    const { POST: subtaskPost } = await import("@/app/api/tasks/[id]/subtasks/route");
    const { key, projectId } = await seedProject();

    const taskRes = await taskPost(makeRequest("/api/tasks", { body: { name: "Parent" }, token: key }));
    const { id: taskId } = await json<{ id: string }>(taskRes);

    const res = await subtaskPost(
      makeRequest(`/api/tasks/${taskId}/subtasks`, { body: { title: "Sub task" }, token: key }),
      routeParams({ id: taskId })
    );
    expect(res.status).toBe(201);
    const body = await json<{ id: string; object: string; task_id: string; project_id: string }>(res);
    expect(body.id).toMatch(/^sub_/);
    expect(body.object).toBe("subtask");
    expect(body.task_id).toBe(taskId);
    expect(body.project_id).toBe(projectId);
  });

  it("returns 404 for non-existent parent task", async () => {
    const { POST: subtaskPost } = await import("@/app/api/tasks/[id]/subtasks/route");
    const res = await subtaskPost(
      makeRequest("/api/tasks/tsk_none/subtasks", { body: { title: "Sub" } }),
      routeParams({ id: "tsk_none" })
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when title is missing", async () => {
    const { POST: taskPost } = await import("@/app/api/tasks/route");
    const { POST: subtaskPost } = await import("@/app/api/tasks/[id]/subtasks/route");
    const { key } = await seedProject();

    const taskRes = await taskPost(makeRequest("/api/tasks", { body: { name: "Task" }, token: key }));
    const { id } = await json<{ id: string }>(taskRes);

    const res = await subtaskPost(
      makeRequest(`/api/tasks/${id}/subtasks`, { body: {}, token: key }),
      routeParams({ id })
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for wrong project creating subtask under owned task", async () => {
    const { POST: taskPost } = await import("@/app/api/tasks/route");
    const { POST: subtaskPost } = await import("@/app/api/tasks/[id]/subtasks/route");
    const a = await seedProject();
    const b = await seedProject();

    const taskRes = await taskPost(makeRequest("/api/tasks", { body: { name: "A task" }, token: a.key }));
    const { id } = await json<{ id: string }>(taskRes);

    const res = await subtaskPost(
      makeRequest(`/api/tasks/${id}/subtasks`, { body: { title: "Inject" }, token: b.key }),
      routeParams({ id })
    );
    expect(res.status).toBe(403);
  });

  it("redirects to subtask page after POST with text/html", async () => {
    const { POST: taskPost } = await import("@/app/api/tasks/route");
    const { POST: subtaskPost } = await import("@/app/api/tasks/[id]/subtasks/route");
    const { key } = await seedProject();

    const taskRes = await taskPost(makeRequest("/api/tasks", { body: { name: "Task" }, token: key }));
    const { id } = await json<{ id: string }>(taskRes);

    const res = await subtaskPost(
      makeRequest(`/api/tasks/${id}/subtasks`, {
        body: { title: "HTML sub" },
        token: key,
        accept: "text/html,application/xhtml+xml",
      }),
      routeParams({ id })
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/api\/subtasks\/sub_/);
  });

  it("creates subtask with default status=todo and priority=medium", async () => {
    const { POST: taskPost } = await import("@/app/api/tasks/route");
    const { POST: subtaskPost } = await import("@/app/api/tasks/[id]/subtasks/route");
    const { key } = await seedProject();

    const taskRes = await taskPost(makeRequest("/api/tasks", { body: { name: "Task" }, token: key }));
    const { id: taskId } = await json<{ id: string }>(taskRes);

    const res = await subtaskPost(
      makeRequest(`/api/tasks/${taskId}/subtasks`, { body: { title: "New" }, token: key }),
      routeParams({ id: taskId })
    );
    const body = await json<{ status: string; priority: string }>(res);
    expect(body.status).toBe("todo");
    expect(body.priority).toBe("medium");
  });
});
