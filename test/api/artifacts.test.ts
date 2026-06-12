import { describe, it, expect } from "vitest";
import { makeRequest, json, routeParams } from "../helpers/request";
import { seedOrganization } from "../helpers/seed";

const collection = () => import("@/app/api/artifacts/route");
const item = () => import("@/app/api/artifacts/[id]/route");
const raw = () => import("@/app/api/artifacts/[id]/raw/route");

interface Artifact {
  id: string;
  object: string;
  organization_id: string | null;
  name: string;
  content: string;
  format: string;
  raw_url: string;
  claim_token?: string;
}

async function createArtifact(
  body: Record<string, unknown>,
  token?: string
): Promise<Artifact> {
  const { POST } = await collection();
  const res = await POST(makeRequest("/api/artifacts", { body, token }));
  expect(res.status).toBe(201);
  return json<Artifact>(res);
}

describe("POST /api/artifacts", () => {
  it("creates a public artifact (no auth) with a claim token", async () => {
    const mem = await createArtifact({ name: "Notes", content: "# hi" });
    expect(mem.object).toBe("artifact");
    expect(mem.organization_id).toBeNull();
    expect(mem.content).toBe("# hi");
    expect(mem.format).toBe("markdown");
    expect(mem.claim_token).toMatch(/^clm_/);
  });

  it("creates an organization-owned artifact when authenticated", async () => {
    const { organizationId, key } = await seedOrganization();
    const mem = await createArtifact({ name: "Owned", content: "x" }, key);
    expect(mem.organization_id).toBe(organizationId);
    expect(mem.claim_token).toBeUndefined();
  });

  it("rejects a missing name with 400", async () => {
    const { POST } = await collection();
    const res = await POST(
      makeRequest("/api/artifacts", { body: { content: "x" } })
    );
    expect(res.status).toBe(400);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("creates an html artifact", async () => {
    const mem = await createArtifact({
      name: "Page",
      content: "<h1>hi</h1>",
      format: "html",
    });
    expect(mem.format).toBe("html");
    expect(mem.raw_url).toBe(`/api/artifacts/${mem.id}/raw`);
  });

  it("rejects an unknown format", async () => {
    const { POST } = await collection();
    const res = await POST(
      makeRequest("/api/artifacts", {
        body: { name: "x", content: "y", format: "docx" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 for an invalid token", async () => {
    const { POST } = await collection();
    const res = await POST(
      makeRequest("/api/artifacts", { body: { name: "x", content: "y" }, token: "bad" })
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/artifacts", () => {
  it("lists only the caller's artifacts", async () => {
    const a = await seedOrganization();
    const b = await seedOrganization();
    await createArtifact({ name: "A1", content: "1" }, a.key);
    await createArtifact({ name: "A2", content: "2" }, a.key);
    await createArtifact({ name: "B1", content: "3" }, b.key);

    const { GET } = await collection();
    const res = await GET(makeRequest("/api/artifacts", { token: a.key }));
    const body = await json<{ data: Artifact[] }>(res);
    expect(body.data).toHaveLength(2);
    expect(body.data.every((m) => m.organization_id === a.organizationId)).toBe(true);
  });

  it("returns an empty list for anonymous callers", async () => {
    await createArtifact({ name: "Public", content: "x" });
    const { GET } = await collection();
    const res = await GET(makeRequest("/api/artifacts"));
    const body = await json<{ data: Artifact[] }>(res);
    expect(body.data).toHaveLength(0);
  });
});

describe("/api/artifacts/[id]", () => {
  it("gets a public artifact by ID without auth", async () => {
    const mem = await createArtifact({ name: "Pub", content: "hello" });
    const { GET } = await item();
    const res = await GET(
      makeRequest(`/api/artifacts/${mem.id}`),
      routeParams({ id: mem.id })
    );
    expect(res.status).toBe(200);
    const body = await json<Artifact>(res);
    expect(body.content).toBe("hello");
  });

  it("404s for an unknown artifact", async () => {
    const { GET } = await item();
    const res = await GET(
      makeRequest("/api/artifacts/art_missing"),
      routeParams({ id: "art_missing" })
    );
    expect(res.status).toBe(404);
  });

  it("forbids access to another org's artifact (403)", async () => {
    const owner = await seedOrganization();
    const other = await seedOrganization();
    const mem = await createArtifact({ name: "Owned", content: "x" }, owner.key);

    const { GET } = await item();
    const res = await GET(
      makeRequest(`/api/artifacts/${mem.id}`, { token: other.key }),
      routeParams({ id: mem.id })
    );
    expect(res.status).toBe(403);
  });

  it("updates content via PATCH", async () => {
    const mem = await createArtifact({ name: "Before", content: "old" });
    const { PATCH } = await item();
    const res = await PATCH(
      makeRequest(`/api/artifacts/${mem.id}`, {
        method: "PATCH",
        body: { content: "new" },
      }),
      routeParams({ id: mem.id })
    );
    expect(res.status).toBe(200);
    const body = await json<Artifact>(res);
    expect(body.content).toBe("new");
    expect(body.name).toBe("Before");
  });

  it("updates format via PATCH", async () => {
    const mem = await createArtifact({ name: "Doc", content: "# md" });
    const { PATCH } = await item();
    const res = await PATCH(
      makeRequest(`/api/artifacts/${mem.id}`, {
        method: "PATCH",
        body: { content: "<p>now html</p>", format: "html" },
      }),
      routeParams({ id: mem.id })
    );
    expect(res.status).toBe(200);
    const body = await json<Artifact>(res);
    expect(body.format).toBe("html");
  });

  it("deletes a artifact (204)", async () => {
    const mem = await createArtifact({ name: "Doomed", content: "x" });
    const { DELETE } = await item();
    const del = await DELETE(
      makeRequest(`/api/artifacts/${mem.id}`, { method: "DELETE" }),
      routeParams({ id: mem.id })
    );
    expect(del.status).toBe(204);

    const { GET } = await item();
    const after = await GET(
      makeRequest(`/api/artifacts/${mem.id}`),
      routeParams({ id: mem.id })
    );
    expect(after.status).toBe(404);
  });
});

describe("GET /api/artifacts/[id]/raw", () => {
  it("serves html content as text/html with a sandbox CSP", async () => {
    const mem = await createArtifact({
      name: "Page",
      content: "<h1>hi</h1>",
      format: "html",
    });
    const { GET } = await raw();
    const res = await GET(
      makeRequest(`/api/artifacts/${mem.id}/raw`),
      routeParams({ id: mem.id })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(await res.text()).toBe("<h1>hi</h1>");
  });

  it("serves markdown content as text/markdown", async () => {
    const mem = await createArtifact({ name: "Notes", content: "# hi" });
    const { GET } = await raw();
    const res = await GET(
      makeRequest(`/api/artifacts/${mem.id}/raw`),
      routeParams({ id: mem.id })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(await res.text()).toBe("# hi");
  });

  it("404s for an unknown artifact", async () => {
    const { GET } = await raw();
    const res = await GET(
      makeRequest("/api/artifacts/art_missing/raw"),
      routeParams({ id: "art_missing" })
    );
    expect(res.status).toBe(404);
  });

  it("forbids access to another org's artifact (403)", async () => {
    const owner = await seedOrganization();
    const other = await seedOrganization();
    const mem = await createArtifact(
      { name: "Owned", content: "<p>secret</p>", format: "html" },
      owner.key
    );

    const { GET } = await raw();
    const res = await GET(
      makeRequest(`/api/artifacts/${mem.id}/raw`, { token: other.key }),
      routeParams({ id: mem.id })
    );
    expect(res.status).toBe(403);
  });
});
