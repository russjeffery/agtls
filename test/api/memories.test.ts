import { describe, it, expect } from "vitest";
import { makeRequest, json, routeParams } from "../helpers/request";
import { seedOrganization } from "../helpers/seed";

const collection = () => import("@/app/api/memories/route");
const item = () => import("@/app/api/memories/[id]/route");

interface Memory {
  id: string;
  object: string;
  organization_id: string | null;
  name: string;
  content: string;
  format: string;
  claim_token?: string;
}

async function createMemory(
  body: Record<string, unknown>,
  token?: string
): Promise<Memory> {
  const { POST } = await collection();
  const res = await POST(makeRequest("/api/memories", { body, token }));
  expect(res.status).toBe(201);
  return json<Memory>(res);
}

describe("POST /api/memories", () => {
  it("creates a public memory (no auth) with a claim token", async () => {
    const mem = await createMemory({ name: "Notes", content: "# hi" });
    expect(mem.object).toBe("memory");
    expect(mem.organization_id).toBeNull();
    expect(mem.content).toBe("# hi");
    expect(mem.format).toBe("markdown");
    expect(mem.claim_token).toMatch(/^clm_/);
  });

  it("creates an organization-owned memory when authenticated", async () => {
    const { organizationId, key } = await seedOrganization();
    const mem = await createMemory({ name: "Owned", content: "x" }, key);
    expect(mem.organization_id).toBe(organizationId);
    expect(mem.claim_token).toBeUndefined();
  });

  it("rejects a missing name with 400", async () => {
    const { POST } = await collection();
    const res = await POST(
      makeRequest("/api/memories", { body: { content: "x" } })
    );
    expect(res.status).toBe(400);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("rejects an unknown format", async () => {
    const { POST } = await collection();
    const res = await POST(
      makeRequest("/api/memories", {
        body: { name: "x", content: "y", format: "html" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 for an invalid token", async () => {
    const { POST } = await collection();
    const res = await POST(
      makeRequest("/api/memories", { body: { name: "x", content: "y" }, token: "bad" })
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/memories", () => {
  it("lists only the caller's memories", async () => {
    const a = await seedOrganization();
    const b = await seedOrganization();
    await createMemory({ name: "A1", content: "1" }, a.key);
    await createMemory({ name: "A2", content: "2" }, a.key);
    await createMemory({ name: "B1", content: "3" }, b.key);

    const { GET } = await collection();
    const res = await GET(makeRequest("/api/memories", { token: a.key }));
    const body = await json<{ data: Memory[] }>(res);
    expect(body.data).toHaveLength(2);
    expect(body.data.every((m) => m.organization_id === a.organizationId)).toBe(true);
  });

  it("returns an empty list for anonymous callers", async () => {
    await createMemory({ name: "Public", content: "x" });
    const { GET } = await collection();
    const res = await GET(makeRequest("/api/memories"));
    const body = await json<{ data: Memory[] }>(res);
    expect(body.data).toHaveLength(0);
  });
});

describe("/api/memories/[id]", () => {
  it("gets a public memory by ID without auth", async () => {
    const mem = await createMemory({ name: "Pub", content: "hello" });
    const { GET } = await item();
    const res = await GET(
      makeRequest(`/api/memories/${mem.id}`),
      routeParams({ id: mem.id })
    );
    expect(res.status).toBe(200);
    const body = await json<Memory>(res);
    expect(body.content).toBe("hello");
  });

  it("404s for an unknown memory", async () => {
    const { GET } = await item();
    const res = await GET(
      makeRequest("/api/memories/memo_missing"),
      routeParams({ id: "memo_missing" })
    );
    expect(res.status).toBe(404);
  });

  it("forbids access to another org's memory (403)", async () => {
    const owner = await seedOrganization();
    const other = await seedOrganization();
    const mem = await createMemory({ name: "Owned", content: "x" }, owner.key);

    const { GET } = await item();
    const res = await GET(
      makeRequest(`/api/memories/${mem.id}`, { token: other.key }),
      routeParams({ id: mem.id })
    );
    expect(res.status).toBe(403);
  });

  it("updates content via PATCH", async () => {
    const mem = await createMemory({ name: "Before", content: "old" });
    const { PATCH } = await item();
    const res = await PATCH(
      makeRequest(`/api/memories/${mem.id}`, {
        method: "PATCH",
        body: { content: "new" },
      }),
      routeParams({ id: mem.id })
    );
    expect(res.status).toBe(200);
    const body = await json<Memory>(res);
    expect(body.content).toBe("new");
    expect(body.name).toBe("Before");
  });

  it("deletes a memory (204)", async () => {
    const mem = await createMemory({ name: "Doomed", content: "x" });
    const { DELETE } = await item();
    const del = await DELETE(
      makeRequest(`/api/memories/${mem.id}`, { method: "DELETE" }),
      routeParams({ id: mem.id })
    );
    expect(del.status).toBe(204);

    const { GET } = await item();
    const after = await GET(
      makeRequest(`/api/memories/${mem.id}`),
      routeParams({ id: mem.id })
    );
    expect(after.status).toBe(404);
  });
});
