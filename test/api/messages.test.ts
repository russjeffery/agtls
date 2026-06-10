import { describe, it, expect, vi } from "vitest";
import { makeRequest, json, routeParams } from "../helpers/request";
import { seedOrganization } from "../helpers/seed";
import { dispatchDueMessages } from "@/lib/messages/dispatch";

const collection = () => import("@/app/api/messages/route");
const item = () => import("@/app/api/messages/[id]/route");
const dispatch = () => import("@/app/api/messages/dispatch/route");

interface Message {
  id: string;
  object: string;
  organization_id: string | null;
  url: string;
  method: string;
  status: string;
  scheduled_at: number;
  attempts: number;
  response_status: number | null;
  last_error: string | null;
  claim_token?: string;
}

async function schedule(
  body: Record<string, unknown>,
  token?: string
): Promise<Message> {
  const { POST } = await collection();
  const res = await POST(makeRequest("/api/messages", { body, token }));
  expect(res.status).toBe(201);
  return json<Message>(res);
}

// A fetch stub that records calls and returns a configurable status.
function fetchStub(status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    // 204/205/304 must not carry a body, so always use a null body.
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("POST /api/messages", () => {
  it("schedules a public message via delay_seconds with a claim token", async () => {
    const before = Date.now();
    const msg = await schedule({
      url: "https://example.com/wake",
      delay_seconds: 4500,
    });
    expect(msg.object).toBe("scheduled_message");
    expect(msg.organization_id).toBeNull();
    expect(msg.status).toBe("scheduled");
    expect(msg.method).toBe("POST");
    expect(msg.claim_token).toMatch(/^clm_/);
    // ~75 minutes out.
    expect(msg.scheduled_at * 1000).toBeGreaterThanOrEqual(before + 4500_000 - 2000);
  });

  it("schedules via an absolute scheduled_at and owns it when authenticated", async () => {
    const { organizationId, key } = await seedOrganization();
    const at = Math.floor(Date.now() / 1000) + 600;
    const msg = await schedule(
      { url: "https://example.com/x", scheduled_at: at, method: "GET" },
      key
    );
    expect(msg.organization_id).toBe(organizationId);
    expect(msg.scheduled_at).toBe(at);
    expect(msg.method).toBe("GET");
  });

  it("rejects a non-http url", async () => {
    const { POST } = await collection();
    const res = await POST(
      makeRequest("/api/messages", {
        body: { url: "ftp://example.com", delay_seconds: 10 },
      })
    );
    expect(res.status).toBe(400);
    const body = await json<{ error: { param: string } }>(res);
    expect(body.error.param).toBe("url");
  });

  it("rejects a missing schedule (no scheduled_at or delay_seconds)", async () => {
    const { POST } = await collection();
    const res = await POST(
      makeRequest("/api/messages", { body: { url: "https://example.com" } })
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/messages", () => {
  it("lists only the caller's messages", async () => {
    const a = await seedOrganization();
    const b = await seedOrganization();
    await schedule({ url: "https://a.com", delay_seconds: 60 }, a.key);
    await schedule({ url: "https://b.com", delay_seconds: 60 }, b.key);

    const { GET } = await collection();
    const res = await GET(makeRequest("/api/messages", { token: a.key }));
    const body = await json<{ data: Message[] }>(res);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].organization_id).toBe(a.organizationId);
  });
});

describe("/api/messages/[id]", () => {
  it("reschedules a pending message via PATCH", async () => {
    const msg = await schedule({ url: "https://example.com", delay_seconds: 60 });
    const newAt = Math.floor(Date.now() / 1000) + 999;
    const { PATCH } = await item();
    const res = await PATCH(
      makeRequest(`/api/messages/${msg.id}`, {
        method: "PATCH",
        body: { scheduled_at: newAt },
      }),
      routeParams({ id: msg.id })
    );
    expect(res.status).toBe(200);
    const body = await json<Message>(res);
    expect(body.scheduled_at).toBe(newAt);
  });

  it("refuses to edit a message that already fired", async () => {
    const msg = await schedule({
      url: "https://example.com",
      scheduled_at: Math.floor(Date.now() / 1000) - 10,
    });
    const { impl } = fetchStub(200);
    await dispatchDueMessages({ fetchImpl: impl });

    const { PATCH } = await item();
    const res = await PATCH(
      makeRequest(`/api/messages/${msg.id}`, {
        method: "PATCH",
        body: { delay_seconds: 60 },
      }),
      routeParams({ id: msg.id })
    );
    expect(res.status).toBe(400);
  });

  it("cancels (deletes) a pending message", async () => {
    const msg = await schedule({ url: "https://example.com", delay_seconds: 60 });
    const { DELETE } = await item();
    const del = await DELETE(
      makeRequest(`/api/messages/${msg.id}`, { method: "DELETE" }),
      routeParams({ id: msg.id })
    );
    expect(del.status).toBe(204);

    const { GET } = await item();
    const after = await GET(
      makeRequest(`/api/messages/${msg.id}`),
      routeParams({ id: msg.id })
    );
    expect(after.status).toBe(404);
  });
});

describe("dispatchDueMessages", () => {
  async function getMessage(id: string, token?: string): Promise<Message> {
    const { GET } = await item();
    const res = await GET(
      makeRequest(`/api/messages/${id}`, { token }),
      routeParams({ id })
    );
    return json<Message>(res);
  }

  it("delivers a due message and records the response status", async () => {
    const msg = await schedule({
      url: "https://example.com/hook",
      method: "POST",
      body: "{}",
      scheduled_at: Math.floor(Date.now() / 1000) - 5,
    });

    const { impl, calls } = fetchStub(204);
    const summary = await dispatchDueMessages({ fetchImpl: impl });
    expect(summary.dispatched).toBe(1);
    expect(summary.delivered).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://example.com/hook");

    const after = await getMessage(msg.id);
    expect(after.status).toBe("delivered");
    expect(after.response_status).toBe(204);
    expect(after.attempts).toBe(1);
  });

  it("does not fire a message that isn't due yet", async () => {
    await schedule({ url: "https://example.com", delay_seconds: 3600 });
    const { impl, calls } = fetchStub(200);
    const summary = await dispatchDueMessages({ fetchImpl: impl });
    expect(summary.dispatched).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("marks a message failed when the target errors", async () => {
    const msg = await schedule({
      url: "https://example.com/down",
      scheduled_at: Math.floor(Date.now() / 1000) - 5,
    });
    const { impl } = fetchStub(500);
    await dispatchDueMessages({ fetchImpl: impl });

    const after = await getMessage(msg.id);
    expect(after.status).toBe("failed");
    expect(after.response_status).toBe(500);
    expect(after.last_error).toContain("500");
  });

  it("does not re-deliver an already-delivered message", async () => {
    await schedule({
      url: "https://example.com",
      scheduled_at: Math.floor(Date.now() / 1000) - 5,
    });
    const first = fetchStub(200);
    await dispatchDueMessages({ fetchImpl: first.impl });
    const second = fetchStub(200);
    const summary = await dispatchDueMessages({ fetchImpl: second.impl });
    expect(summary.dispatched).toBe(0);
    expect(second.calls).toHaveLength(0);
  });
});

describe("POST /api/messages/dispatch", () => {
  it("runs the dispatcher and returns a summary", async () => {
    await schedule({
      url: "https://example.com",
      scheduled_at: Math.floor(Date.now() / 1000) - 5,
    });
    const stub = fetchStub(200);
    vi.stubGlobal("fetch", stub.impl);
    try {
      const { POST } = await dispatch();
      const res = await POST(
        makeRequest("/api/messages/dispatch", { method: "POST" })
      );
      expect(res.status).toBe(200);
      const body = await json<{ object: string; delivered: number }>(res);
      expect(body.object).toBe("dispatch_result");
      expect(body.delivered).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects calls without the cron secret when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = "s3cret";
    try {
      const { POST } = await dispatch();
      const res = await POST(
        makeRequest("/api/messages/dispatch", { method: "POST" })
      );
      expect(res.status).toBe(401);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});
