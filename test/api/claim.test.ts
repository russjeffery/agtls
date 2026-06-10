import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { makeRequest, json, routeParams } from "../helpers/request";
import { seedOrganization } from "../helpers/seed";
import { useTrustedProvider, mintIdJag } from "../helpers/agent-auth";
import { testDb } from "../helpers/db";
import {
  task as taskTable,
  subtask as subtaskTable,
  webhookEndpoint as endpointTable,
  webhookEvent as eventTable,
} from "@/lib/db/schema";

interface CreatedPublic {
  id: string;
  claim_token: string;
  claim_url: string;
  organization_id: string | null;
}

async function createPublicTask(name = "Public task"): Promise<CreatedPublic> {
  const { POST } = await import("@/app/api/tasks/route");
  const res = await POST(makeRequest("/api/tasks", { body: { name } }));
  expect(res.status).toBe(201);
  return json<CreatedPublic>(res);
}

async function claim(id: string, claimToken: string, token?: string, accept?: string) {
  const { POST } = await import("@/app/api/claim/[id]/route");
  return POST(
    makeRequest(`/api/claim/${id}`, {
      body: { claim_token: claimToken },
      token,
      accept,
    }),
    routeParams({ id })
  );
}

// ─── claim_token issuance on public creation ────────────────────────────────

describe("claim_token on public creation", () => {
  it("returns claim_token and claim_url for an unauthenticated task", async () => {
    const body = await createPublicTask();
    expect(body.claim_token).toMatch(/^clm_/);
    expect(body.claim_url).toBe(`/api/claim/${body.id}`);
    expect(body.organization_id).toBeNull();

    // Only the hash is persisted — never the plaintext token.
    const [row] = await testDb.select().from(taskTable).where(eq(taskTable.id, body.id));
    expect(row.claimTokenHash).toBeTruthy();
    expect(row.claimTokenHash).not.toContain(body.claim_token);
  });

  it("does not return a claim_token for an authenticated task", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const { key } = await seedOrganization();
    const res = await POST(makeRequest("/api/tasks", { body: { name: "Owned" }, token: key }));
    const body = await json<Record<string, unknown>>(res);
    expect(body.claim_token).toBeUndefined();
    expect(body.claim_url).toBeUndefined();
  });

  it("returns claim_token for an unauthenticated webhook endpoint", async () => {
    const { POST } = await import("@/app/api/webhooks/route");
    const res = await POST(makeRequest("/api/webhooks", { body: { name: "Hook" } }));
    expect(res.status).toBe(201);
    const body = await json<CreatedPublic>(res);
    expect(body.id).toMatch(/^wh_/);
    expect(body.claim_token).toMatch(/^clm_/);
  });

  it("returns claim_token for an unauthenticated standalone subtask", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const res = await POST(makeRequest("/api/subtasks", { body: { title: "Sub" } }));
    expect(res.status).toBe(201);
    const body = await json<CreatedPublic>(res);
    expect(body.id).toMatch(/^sub_/);
    expect(body.claim_token).toMatch(/^clm_/);
  });

  it("returns claim_token for a subtask created under a public task", async () => {
    const parent = await createPublicTask("Parent");
    const { POST } = await import("@/app/api/tasks/[id]/subtasks/route");
    const res = await POST(
      makeRequest(`/api/tasks/${parent.id}/subtasks`, { body: { title: "Nested" } }),
      routeParams({ id: parent.id })
    );
    expect(res.status).toBe(201);
    const body = await json<CreatedPublic>(res);
    expect(body.claim_token).toMatch(/^clm_/);
  });
});

// ─── POST /api/claim/{id} ────────────────────────────────────────────────────

describe("POST /api/claim/[id]", () => {
  it("claims a public task into the caller's project", async () => {
    const created = await createPublicTask();
    const { key, organizationId } = await seedOrganization();

    const res = await claim(created.id, created.claim_token, key);
    expect(res.status).toBe(200);
    const body = await json<{ id: string; organization_id: string }>(res);
    expect(body.id).toBe(created.id);
    expect(body.organization_id).toBe(organizationId);

    // Token is one-shot: the stored hash is cleared.
    const [row] = await testDb.select().from(taskTable).where(eq(taskTable.id, created.id));
    expect(row.organizationId).toBe(organizationId);
    expect(row.claimTokenHash).toBeNull();
  });

  it("claiming a task also claims its public subtasks", async () => {
    const created = await createPublicTask();
    const { POST: subPost } = await import("@/app/api/tasks/[id]/subtasks/route");
    const subRes = await subPost(
      makeRequest(`/api/tasks/${created.id}/subtasks`, { body: { title: "Child" } }),
      routeParams({ id: created.id })
    );
    const sub = await json<CreatedPublic>(subRes);

    const { key, organizationId } = await seedOrganization();
    const res = await claim(created.id, created.claim_token, key);
    expect(res.status).toBe(200);

    const [subRow] = await testDb
      .select()
      .from(subtaskTable)
      .where(eq(subtaskTable.id, sub.id));
    expect(subRow.organizationId).toBe(organizationId);
    expect(subRow.claimTokenHash).toBeNull();
  });

  it("claims a public subtask on its own", async () => {
    const { POST } = await import("@/app/api/subtasks/route");
    const createRes = await POST(makeRequest("/api/subtasks", { body: { title: "Solo" } }));
    const created = await json<CreatedPublic>(createRes);

    const { key, organizationId } = await seedOrganization();
    const res = await claim(created.id, created.claim_token, key);
    expect(res.status).toBe(200);
    const body = await json<{ organization_id: string }>(res);
    expect(body.organization_id).toBe(organizationId);
  });

  it("claims a public webhook endpoint and re-homes its events", async () => {
    const { POST } = await import("@/app/api/webhooks/route");
    const createRes = await POST(makeRequest("/api/webhooks", { body: { name: "Hook" } }));
    const created = await json<CreatedPublic>(createRes);

    // Receive an event while the endpoint is still public.
    const { POST: catchPost } = await import("@/app/api/catch/[id]/route");
    const catchRes = await catchPost(
      makeRequest(`/api/catch/${created.id}`, { body: { hello: "world" } }),
      routeParams({ id: created.id })
    );
    expect(catchRes.status).toBe(200);

    const { key, organizationId } = await seedOrganization();
    const res = await claim(created.id, created.claim_token, key);
    expect(res.status).toBe(200);
    const body = await json<{ organization_id: string }>(res);
    expect(body.organization_id).toBe(organizationId);

    const events = await testDb
      .select()
      .from(eventTable)
      .where(eq(eventTable.endpointId, created.id));
    expect(events).toHaveLength(1);
    expect(events[0].organizationId).toBe(organizationId);

    const [endpointRow] = await testDb
      .select()
      .from(endpointTable)
      .where(eq(endpointTable.id, created.id));
    expect(endpointRow.claimTokenHash).toBeNull();
  });

  it("returns 401 without auth", async () => {
    const created = await createPublicTask();
    const res = await claim(created.id, created.claim_token);
    expect(res.status).toBe(401);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("authentication_error");
  });

  it("returns 401 for an invalid bearer token", async () => {
    const created = await createPublicTask();
    const res = await claim(created.id, created.claim_token, "garbage");
    expect(res.status).toBe(401);
  });

  it("returns 403 invalid_claim_token for a wrong token", async () => {
    const created = await createPublicTask();
    const { key } = await seedOrganization();
    const res = await claim(created.id, "clm_wrongwrongwrongwrongwrong", key);
    expect(res.status).toBe(403);
    const body = await json<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("invalid_claim_token");

    // Resource untouched.
    const [row] = await testDb.select().from(taskTable).where(eq(taskTable.id, created.id));
    expect(row.organizationId).toBeNull();
    expect(row.claimTokenHash).not.toBeNull();
  });

  it("returns 400 resource_already_claimed on a second claim", async () => {
    const created = await createPublicTask();
    const a = await seedOrganization();
    const b = await seedOrganization();

    expect((await claim(created.id, created.claim_token, a.key)).status).toBe(200);
    const res = await claim(created.id, created.claim_token, b.key);
    expect(res.status).toBe(400);
    const body = await json<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("resource_already_claimed");

    // Still owned by the first claimer.
    const [row] = await testDb.select().from(taskTable).where(eq(taskTable.id, created.id));
    expect(row.organizationId).toBe(a.organizationId);
  });

  it("returns 400 for a resource created with auth (never claimable)", async () => {
    const { POST } = await import("@/app/api/tasks/route");
    const a = await seedOrganization();
    const b = await seedOrganization();
    const createRes = await POST(makeRequest("/api/tasks", { body: { name: "Owned" }, token: a.key }));
    const { id } = await json<{ id: string }>(createRes);

    const res = await claim(id, "clm_anything", b.key);
    expect(res.status).toBe(400);
    const body = await json<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("resource_already_claimed");
  });

  it("returns 404 for an unknown resource ID", async () => {
    const { key } = await seedOrganization();
    const res = await claim("tsk_doesnotexist", "clm_whatever", key);
    expect(res.status).toBe(404);
    const body = await json<{ error: { code: string } }>(res);
    expect(body.error.code).toBe("resource_not_found");
  });

  it("returns 400 for an unsupported ID prefix", async () => {
    const { key } = await seedOrganization();
    const res = await claim("prj_notclaimable", "clm_whatever", key);
    expect(res.status).toBe(400);
    const body = await json<{ error: { code: string; param: string } }>(res);
    expect(body.error.code).toBe("invalid_param");
    expect(body.error.param).toBe("id");
  });

  it("returns 400 when claim_token is missing from the body", async () => {
    const created = await createPublicTask();
    const { key } = await seedOrganization();
    const { POST } = await import("@/app/api/claim/[id]/route");
    const res = await POST(
      makeRequest(`/api/claim/${created.id}`, { body: {}, token: key }),
      routeParams({ id: created.id })
    );
    expect(res.status).toBe(400);
  });

  it("redirects to the resource page after claim with Accept: text/html", async () => {
    const created = await createPublicTask();
    const { key } = await seedOrganization();
    const res = await claim(
      created.id,
      created.claim_token,
      key,
      "text/html,application/xhtml+xml"
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain(`/api/tasks/${created.id}`);
  });
});

// ─── Agent-auth integration ──────────────────────────────────────────────────

describe("claim with agent-auth credentials", () => {
  it("claims with a credential from an anonymous registration", async () => {
    const created = await createPublicTask();

    const { POST: register } = await import("@/app/api/agent/auth/route");
    const regRes = await register(
      makeRequest("/api/agent/auth", { body: { type: "anonymous" } })
    );
    expect(regRes.status).toBe(201);
    const reg = await json<{ credential: string }>(regRes);

    const res = await claim(created.id, created.claim_token, reg.credential);
    expect(res.status).toBe(200);
    const body = await json<{ organization_id: string }>(res);
    expect(body.organization_id).toMatch(/^org_/);

    // The claimed task now shows up in the agent's own task list.
    const { GET } = await import("@/app/api/tasks/route");
    const listRes = await GET(makeRequest("/api/tasks", { token: reg.credential }));
    const list = await json<{ data: { id: string }[] }>(listRes);
    expect(list.data.map((t) => t.id)).toContain(created.id);
  });

  it("claims with a credential from an identity_assertion registration", async () => {
    const created = await createPublicTask();

    await useTrustedProvider();
    const assertion = await mintIdJag();
    const { POST: register } = await import("@/app/api/agent/auth/route");
    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion,
        },
      })
    );
    expect(regRes.status).toBe(201);
    const reg = await json<{ credential: string }>(regRes);

    const res = await claim(created.id, created.claim_token, reg.credential);
    expect(res.status).toBe(200);
    const body = await json<{ organization_id: string }>(res);
    expect(body.organization_id).toMatch(/^org_/);
  });
});
