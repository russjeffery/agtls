import { describe, it, expect } from "vitest";
import { makeRequest, json, routeParams } from "../helpers/request";
import { seedOrganization } from "../helpers/seed";
import { mockSession } from "../helpers/session";

// The logged-in browser experience: a BetterAuth session (no API key) scopes
// list endpoints to the orgs the user belongs to, grants access to owned
// items, and gets friendly HTML for 403/404. Anonymous callers can't
// enumerate anything; public items stay reachable by ID.

const HTML = "text/html,application/xhtml+xml";

async function createOwnedTask(key: string, name = "Org task") {
  const { POST } = await import("@/app/api/tasks/route");
  const res = await POST(
    makeRequest("/api/tasks", { body: { name }, token: key })
  );
  return json<{ id: string }>(res);
}

describe("session-scoped lists", () => {
  it("lists tasks from the session user's organizations", async () => {
    const { GET } = await import("@/app/api/tasks/route");
    const org = await seedOrganization();
    await createOwnedTask(org.key, "Visible to session");

    mockSession(org.userId);
    const res = await GET(makeRequest("/api/tasks"));
    expect(res.status).toBe(200);
    const body = await json<{ data: { name: string }[] }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Visible to session");
  });

  it("does not show other organizations' tasks to a session user", async () => {
    const { GET } = await import("@/app/api/tasks/route");
    const a = await seedOrganization();
    const b = await seedOrganization();
    await createOwnedTask(a.key, "A's task");

    mockSession(b.userId);
    const res = await GET(makeRequest("/api/tasks"));
    const body = await json<{ data: unknown[] }>(res);
    expect(body.data).toHaveLength(0);
  });

  it("lists webhooks from the session user's organizations", async () => {
    const { GET, POST } = await import("@/app/api/webhooks/route");
    const org = await seedOrganization();
    await POST(
      makeRequest("/api/webhooks", { body: { name: "Org hook" }, token: org.key })
    );

    mockSession(org.userId);
    const res = await GET(makeRequest("/api/webhooks"));
    const body = await json<{ data: { name: string }[] }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Org hook");
  });

  it("never lists public tasks, even for a session user", async () => {
    const { GET, POST } = await import("@/app/api/tasks/route");
    const org = await seedOrganization();
    await POST(makeRequest("/api/tasks", { body: { name: "Public" } }));

    mockSession(org.userId);
    const res = await GET(makeRequest("/api/tasks"));
    const body = await json<{ data: unknown[] }>(res);
    expect(body.data).toHaveLength(0);
  });
});

describe("session access to items", () => {
  it("grants a session user access to a task owned by their org", async () => {
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const org = await seedOrganization();
    const { id } = await createOwnedTask(org.key);

    mockSession(org.userId);
    const res = await GET(makeRequest(`/api/tasks/${id}`), routeParams({ id }));
    expect(res.status).toBe(200);
  });

  it("lets a session user update and delete an owned task", async () => {
    const { PATCH, DELETE } = await import("@/app/api/tasks/[id]/route");
    const org = await seedOrganization();
    const { id } = await createOwnedTask(org.key);

    mockSession(org.userId);
    const patched = await PATCH(
      makeRequest(`/api/tasks/${id}`, { method: "PATCH", body: { name: "Renamed" } }),
      routeParams({ id })
    );
    expect(patched.status).toBe(200);

    const deleted = await DELETE(
      makeRequest(`/api/tasks/${id}`, { method: "DELETE" }),
      routeParams({ id })
    );
    expect(deleted.status).toBe(204);
  });

  it("returns 403 for a session user on another org's task", async () => {
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const a = await seedOrganization();
    const b = await seedOrganization();
    const { id } = await createOwnedTask(a.key);

    mockSession(b.userId);
    const res = await GET(makeRequest(`/api/tasks/${id}`), routeParams({ id }));
    expect(res.status).toBe(403);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("authorization_error");
  });

  it("still serves public tasks by ID to anonymous callers", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const createRes = await POST(
      makeRequest("/api/tasks", { body: { name: "Public" } })
    );
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(makeRequest(`/api/tasks/${id}`), routeParams({ id }));
    expect(res.status).toBe(200);
  });

  it("a subtask created by a session user under an owned task inherits the org", async () => {
    const { POST: subtaskPost } = await import(
      "@/app/api/tasks/[id]/subtasks/route"
    );
    const org = await seedOrganization();
    const { id: taskId } = await createOwnedTask(org.key);

    mockSession(org.userId);
    const res = await subtaskPost(
      makeRequest(`/api/tasks/${taskId}/subtasks`, { body: { title: "Sub" } }),
      routeParams({ id: taskId })
    );
    expect(res.status).toBe(201);
    const body = await json<{ organization_id: string }>(res);
    expect(body.organization_id).toBe(org.organizationId);
  });
});

describe("browser HTML responses", () => {
  it("shows a sign-in prompt instead of a list to anonymous browsers", async () => {
    const { GET } = await import("@/app/api/tasks/route");
    const res = await GET(makeRequest("/api/tasks", { accept: HTML }));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Sign in to see your tasks");
    expect(html).toContain("/sign-in");
  });

  it("shows the account menu to a signed-in browser", async () => {
    const { GET } = await import("@/app/api/tasks/route");
    const org = await seedOrganization();

    mockSession(org.userId, "human@example.com");
    const res = await GET(makeRequest("/api/tasks", { accept: HTML }));
    const html = await res.text();
    expect(html).toContain("account-menu");
    expect(html).toContain("human@example.com");
    expect(html).toContain("/dashboard");
    expect(html).toContain("/keys");
    expect(html).toContain("/account");
  });

  it("serves a friendly 403 page for an inaccessible task", async () => {
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const a = await seedOrganization();
    const b = await seedOrganization();
    const { id } = await createOwnedTask(a.key);

    mockSession(b.userId);
    const res = await GET(
      makeRequest(`/api/tasks/${id}`, { accept: HTML }),
      routeParams({ id })
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type") ?? "").toContain("text/html");
    const html = await res.text();
    expect(html).toContain("don't have access");
  });

  it("serves a friendly 404 page for a missing task", async () => {
    const { GET } = await import("@/app/api/tasks/[id]/route");
    const res = await GET(
      makeRequest("/api/tasks/tsk_ghost", { accept: HTML }),
      routeParams({ id: "tsk_ghost" })
    );
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("Task not found");
  });

  it("serves a friendly 403 page for another org's webhook endpoint", async () => {
    const { POST } = await import("@/app/api/webhooks/route");
    const { GET } = await import("@/app/api/webhooks/[id]/route");
    const a = await seedOrganization();
    const createRes = await POST(
      makeRequest("/api/webhooks", { body: { name: "A's hook" }, token: a.key })
    );
    const { id } = await json<{ id: string }>(createRes);

    const res = await GET(
      makeRequest(`/api/webhooks/${id}`, { accept: HTML }),
      routeParams({ id })
    );
    expect(res.status).toBe(403);
    const html = await res.text();
    expect(html).toContain("don't have access");
  });
});
