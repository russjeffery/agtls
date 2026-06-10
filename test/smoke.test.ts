import { describe, it, expect } from "vitest";
import { newId, newApiKey } from "@/lib/api/ids";
import { makeRequest, json } from "./helpers/request";
import { seedOrganization } from "./helpers/seed";
import { lastClaimViewToken, sentEmails } from "./helpers/email";
import { useTrustedProvider, mintIdJag } from "./helpers/agent-auth";

// Foundation smoke test: proves every harness seam works end to end. The full
// domain suites are written separately; this just guards the infrastructure.

describe("harness: pure unit", () => {
  it("mints prefixed ids and keys", () => {
    expect(newId("task")).toMatch(/^tsk_/);
    expect(newApiKey()).toMatch(/^agt_/);
  });
});

describe("harness: DB-backed route", () => {
  it("creates and reads a task scoped to an API key", async () => {
    const { POST, GET } = await import("@/app/api/tasks/route");
    const { key, organizationId } = await seedOrganization();

    const createRes = await POST(
      makeRequest("/api/tasks", { body: { name: "Ship it" }, token: key })
    );
    expect(createRes.status).toBe(201);
    const task = await json<{ id: string; organization_id: string; object: string }>(
      createRes
    );
    expect(task.id).toMatch(/^tsk_/);
    expect(task.object).toBe("task");
    expect(task.organization_id).toBe(organizationId);

    const listRes = await GET(makeRequest("/api/tasks", { token: key }));
    const list = await json<{ data: { id: string }[] }>(listRes);
    expect(list.data.map((t) => t.id)).toContain(task.id);
  });

  it("isolates resources between organizations", async () => {
    const { POST, GET } = await import("@/app/api/tasks/route");
    const a = await seedOrganization();
    const b = await seedOrganization();

    await POST(makeRequest("/api/tasks", { body: { name: "A only" }, token: a.key }));

    const listB = await GET(makeRequest("/api/tasks", { token: b.key }));
    const data = (await json<{ data: unknown[] }>(listB)).data;
    expect(data).toHaveLength(0);
  });
});

describe("harness: agent-verified flow (JWKS + email stubs)", () => {
  it("registers an agent via a verified ID-JAG and issues a usable credential", async () => {
    await useTrustedProvider();
    const { POST } = await import("@/app/api/agent/auth/route");

    const res = await POST(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion: await mintIdJag(),
          requested_credential_type: "api_key",
        },
        headers: { "x-forwarded-for": "203.0.113.7" },
      })
    );
    expect(res.status).toBe(201);
    const body = await json<{ credential: string; scopes: string[] }>(res);
    expect(body.credential).toMatch(/^agt_/);
    expect(body.scopes).toEqual(["api.read", "api.write"]);

    // The issued credential should authenticate against the resource API.
    const { GET } = await import("@/app/api/tasks/route");
    const listRes = await GET(makeRequest("/api/tasks", { token: body.credential }));
    expect(listRes.status).toBe(200);
  });
});

describe("harness: session-guarded route", () => {
  it("rejects without a session and creates an organization with one", async () => {
    const { POST } = await import("@/app/api/organizations/route");
    const { mockNoSession, mockSession } = await import("./helpers/session");

    mockNoSession();
    const anon = await POST(
      makeRequest("/api/organizations", { body: { name: "X", slug: "x-org" } })
    );
    expect(anon.status).toBe(401);

    const { userId } = await seedOrganization();
    mockSession(userId);
    const res = await POST(
      makeRequest("/api/organizations", { body: { name: "My Org", slug: "my-org" } })
    );
    expect(res.status).toBe(201);
    const org = await json<{ object: string; slug: string }>(res);
    expect(org.object).toBe("organization");
    expect(org.slug).toBe("my-org");
  });
});

describe("harness: email capture", () => {
  it("captures the claim email and exposes the view token", async () => {
    const { POST } = await import("@/app/api/agent/auth/route");
    await POST(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "verified_email",
          assertion: "person@example.com",
        },
        headers: { "x-forwarded-for": "203.0.113.8" },
      })
    );
    expect(sentEmails()).toHaveLength(1);
    expect(lastClaimViewToken()).toMatch(/^cvt_/);
  });
});
