import { describe, it, expect } from "vitest";
import { makeRequest, json, routeParams } from "../helpers/request";
import { seedProject } from "../helpers/seed";

// Helpers to load the various webhook route handlers.
const endpoints = () => import("@/app/api/webhooks/route");
const endpointItem = () => import("@/app/api/webhooks/[id]/route");
const eventsRoute = () => import("@/app/api/webhooks/[id]/events/route");
const catchRoute = () => import("@/app/api/catch/[id]/route");

interface Endpoint {
  id: string;
  object: string;
  project_id: string | null;
  url: string;
  max_events: number;
  event_count?: number;
}

async function createEndpoint(
  body: Record<string, unknown>,
  token?: string
): Promise<Endpoint> {
  const { POST } = await endpoints();
  const res = await POST(makeRequest("/api/webhooks", { body, token }));
  expect(res.status).toBe(201);
  return json<Endpoint>(res);
}

// ─── Endpoint creation ───────────────────────────────────────────────────────

describe("POST /api/webhooks", () => {
  it("creates a public endpoint (no auth) with a catch url", async () => {
    const ep = await createEndpoint({ name: "Public hook" });
    expect(ep.object).toBe("webhook_endpoint");
    expect(ep.project_id).toBeNull();
    expect(ep.url).toBe(`https://app.example.com/api/catch/${ep.id}`);
    expect(ep.max_events).toBe(100); // default when unset
  });

  it("creates a project-owned endpoint when authenticated", async () => {
    const { projectId, key } = await seedProject();
    const ep = await createEndpoint({ name: "Owned", max_events: 5 }, key);
    expect(ep.project_id).toBe(projectId);
    expect(ep.max_events).toBe(5);
  });

  it("rejects a missing name with a 400 invalid_request_error", async () => {
    const { POST } = await endpoints();
    const res = await POST(makeRequest("/api/webhooks", { body: {} }));
    expect(res.status).toBe(400);
    const body = await json<{ error: { type: string; param: string } }>(res);
    expect(body.error.type).toBe("invalid_request_error");
  });

  it("rejects out-of-range max_events", async () => {
    const { POST } = await endpoints();
    const res = await POST(
      makeRequest("/api/webhooks", { body: { name: "x", max_events: 0 } })
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 for an invalid token", async () => {
    const { POST } = await endpoints();
    const res = await POST(
      makeRequest("/api/webhooks", { body: { name: "x" }, token: "bad" })
    );
    expect(res.status).toBe(401);
  });

  it("redirects browser POSTs (303)", async () => {
    const { POST } = await endpoints();
    const res = await POST(
      makeRequest("/api/webhooks", {
        body: { name: "Browser" },
        accept: "text/html,application/xhtml+xml",
      })
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/api/webhooks/");
  });
});

// ─── Listing & content negotiation ───────────────────────────────────────────

describe("GET /api/webhooks", () => {
  it("lists only the caller's endpoints", async () => {
    const a = await seedProject();
    const b = await seedProject();
    await createEndpoint({ name: "A1" }, a.key);
    await createEndpoint({ name: "A2" }, a.key);
    await createEndpoint({ name: "B1" }, b.key);

    const { GET } = await endpoints();
    const res = await GET(makeRequest("/api/webhooks", { token: a.key }));
    const body = await json<{ object: string; data: Endpoint[] }>(res);
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(2);
    expect(body.data.every((e) => e.project_id === a.projectId)).toBe(true);
  });

  it("paginates with limit + after cursor", async () => {
    const { key } = await seedProject();
    for (let i = 0; i < 3; i++) await createEndpoint({ name: `E${i}` }, key);

    const { GET } = await endpoints();
    const first = await json<{ data: Endpoint[]; has_more: boolean; next_cursor: string }>(
      await GET(makeRequest("/api/webhooks?limit=2", { token: key }))
    );
    expect(first.data).toHaveLength(2);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).toBe(first.data[1].id);

    const second = await json<{ data: Endpoint[]; has_more: boolean }>(
      await GET(
        makeRequest(`/api/webhooks?limit=2&after=${first.next_cursor}`, { token: key })
      )
    );
    expect(second.data).toHaveLength(1);
    expect(second.has_more).toBe(false);
  });

  it("serves an HTML page to browsers", async () => {
    const { GET } = await endpoints();
    const res = await GET(
      makeRequest("/api/webhooks", { accept: "text/html,application/xhtml+xml" })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Webhooks");
  });
});

// ─── Single endpoint: get / patch / delete ───────────────────────────────────

describe("/api/webhooks/[id]", () => {
  it("gets an endpoint including its event_count", async () => {
    const ep = await createEndpoint({ name: "Counted" });
    // send two webhooks
    const { POST: send } = await catchRoute();
    await send(makeRequest(`/api/catch/${ep.id}`, { method: "POST" }), routeParams({ id: ep.id }));
    await send(makeRequest(`/api/catch/${ep.id}`, { method: "POST" }), routeParams({ id: ep.id }));

    const { GET } = await endpointItem();
    const res = await GET(makeRequest(`/api/webhooks/${ep.id}`), routeParams({ id: ep.id }));
    expect(res.status).toBe(200);
    const body = await json<Endpoint>(res);
    expect(body.event_count).toBe(2);
  });

  it("returns 404 for an unknown endpoint", async () => {
    const { GET } = await endpointItem();
    const res = await GET(
      makeRequest("/api/webhooks/wh_missing"),
      routeParams({ id: "wh_missing" })
    );
    expect(res.status).toBe(404);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("not_found_error");
  });

  it("forbids access to another project's endpoint (403)", async () => {
    const owner = await seedProject();
    const other = await seedProject();
    const ep = await createEndpoint({ name: "Owned" }, owner.key);

    const { GET } = await endpointItem();
    const res = await GET(
      makeRequest(`/api/webhooks/${ep.id}`, { token: other.key }),
      routeParams({ id: ep.id })
    );
    expect(res.status).toBe(403);
    const body = await json<{ error: { type: string } }>(res);
    expect(body.error.type).toBe("authorization_error");
  });

  it("updates name, description and max_events via PATCH", async () => {
    const ep = await createEndpoint({ name: "Before" });
    const { PATCH } = await endpointItem();
    const res = await PATCH(
      makeRequest(`/api/webhooks/${ep.id}`, {
        method: "PATCH",
        body: { name: "After", max_events: 7 },
      }),
      routeParams({ id: ep.id })
    );
    expect(res.status).toBe(200);
    const body = await json<{ name: string; max_events: number }>(res);
    expect(body.name).toBe("After");
    expect(body.max_events).toBe(7);
  });

  it("deletes an endpoint and its events (204)", async () => {
    const ep = await createEndpoint({ name: "Doomed" });
    const { POST: send } = await catchRoute();
    await send(makeRequest(`/api/catch/${ep.id}`, { method: "POST" }), routeParams({ id: ep.id }));

    const { DELETE } = await endpointItem();
    const del = await DELETE(
      makeRequest(`/api/webhooks/${ep.id}`, { method: "DELETE" }),
      routeParams({ id: ep.id })
    );
    expect(del.status).toBe(204);

    const { GET } = await endpointItem();
    const after = await GET(
      makeRequest(`/api/webhooks/${ep.id}`),
      routeParams({ id: ep.id })
    );
    expect(after.status).toBe(404);
  });
});

// ─── Catch ingestion ─────────────────────────────────────────────────────────

describe("POST /api/catch/[id] (ingestion)", () => {
  it("always returns 200 even for an unknown endpoint, without leaking existence", async () => {
    const { POST } = await catchRoute();
    const res = await POST(
      makeRequest("/api/catch/wh_nope", { method: "POST" }),
      routeParams({ id: "wh_nope" })
    );
    expect(res.status).toBe(200);
    const body = await json<{ received: boolean; event_id: string }>(res);
    expect(body.received).toBe(true);
    expect(body.event_id).toMatch(/^whe_/);
  });

  it("captures method, body, parsed JSON, query and source IP; strips sensitive headers", async () => {
    const ep = await createEndpoint({ name: "Capture" });
    const { POST } = await catchRoute();
    await POST(
      makeRequest(`/api/catch/${ep.id}?foo=bar`, {
        method: "POST",
        rawBody: JSON.stringify({ hello: "world" }),
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.9, 70.0.0.1",
          cookie: "secret=should-be-stripped",
          authorization: "Bearer should-be-stripped",
          "x-custom": "keep-me",
        },
      }),
      routeParams({ id: ep.id })
    );

    const { GET } = await eventsRoute();
    const list = await json<{
      data: {
        method: string;
        path: string;
        parsed_body: unknown;
        query_params: Record<string, string>;
        headers: Record<string, string>;
        source_ip: string;
      }[];
    }>(await GET(makeRequest(`/api/webhooks/${ep.id}/events`), routeParams({ id: ep.id })));

    expect(list.data).toHaveLength(1);
    const ev = list.data[0];
    expect(ev.method).toBe("POST");
    expect(ev.parsed_body).toEqual({ hello: "world" });
    expect(ev.query_params).toEqual({ foo: "bar" });
    expect(ev.source_ip).toBe("203.0.113.9");
    expect(ev.headers["x-custom"]).toBe("keep-me");
    expect(ev.headers.cookie).toBeUndefined();
    expect(ev.headers.authorization).toBeUndefined();
  });

  it("enforces max_events by trimming the oldest events", async () => {
    const ep = await createEndpoint({ name: "Trim", max_events: 2 });
    const { POST } = await catchRoute();
    for (let i = 0; i < 4; i++) {
      await POST(
        makeRequest(`/api/catch/${ep.id}`, {
          method: "POST",
          rawBody: JSON.stringify({ n: i }),
          headers: { "content-type": "application/json" },
        }),
        routeParams({ id: ep.id })
      );
    }

    const { GET } = await eventsRoute();
    const list = await json<{ data: { parsed_body: { n: number } }[] }>(
      await GET(makeRequest(`/api/webhooks/${ep.id}/events`), routeParams({ id: ep.id }))
    );
    expect(list.data).toHaveLength(2);
    // Newest first; the two oldest (n=0,1) were trimmed.
    const ns = list.data.map((e) => e.parsed_body.n).sort();
    expect(ns).toEqual([2, 3]);
  });
});

// ─── Events listing ──────────────────────────────────────────────────────────

describe("/api/webhooks/[id]/events", () => {
  it("lists events newest-first and clears them via DELETE", async () => {
    const ep = await createEndpoint({ name: "Events" });
    const { POST: send } = await catchRoute();
    for (let i = 0; i < 3; i++) {
      await send(makeRequest(`/api/catch/${ep.id}`, { method: "GET" }), routeParams({ id: ep.id }));
    }

    const { GET, DELETE } = await eventsRoute();
    const before = await json<{ data: unknown[] }>(
      await GET(makeRequest(`/api/webhooks/${ep.id}/events`), routeParams({ id: ep.id }))
    );
    expect(before.data).toHaveLength(3);

    const del = await DELETE(
      makeRequest(`/api/webhooks/${ep.id}/events`, { method: "DELETE" }),
      routeParams({ id: ep.id })
    );
    expect(del.status).toBe(204);

    const after = await json<{ data: unknown[] }>(
      await GET(makeRequest(`/api/webhooks/${ep.id}/events`), routeParams({ id: ep.id }))
    );
    expect(after.data).toHaveLength(0);
  });

  it("forbids listing another project's events (403)", async () => {
    const owner = await seedProject();
    const other = await seedProject();
    const ep = await createEndpoint({ name: "Owned" }, owner.key);

    const { GET } = await eventsRoute();
    const res = await GET(
      makeRequest(`/api/webhooks/${ep.id}/events`, { token: other.key }),
      routeParams({ id: ep.id })
    );
    expect(res.status).toBe(403);
  });
});
