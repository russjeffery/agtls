import { describe, it, expect } from "vitest";
import { makeRequest, json } from "../helpers/request";
import { useTrustedProvider, mintIdJag, mintLogoutToken } from "../helpers/agent-auth";
import { testDb } from "../helpers/db";
import { agentRegistration } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function getRoutes() {
  const { POST: register } = await import("@/app/api/agent/auth/route");
  const { POST: revoke } = await import("@/app/api/agent/auth/revoke/route");
  const { GET: listTasks } = await import("@/app/api/tasks/route");
  return { register, revoke, listTasks };
}

async function registerAgentVerified() {
  const { register } = await getRoutes();
  const res = await register(
    makeRequest("/api/agent/auth", {
      body: {
        type: "identity_assertion",
        assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
        assertion: await mintIdJag({ claims: { sub: "user-123" } }),
        requested_credential_type: "api_key",
      },
    })
  );
  expect(res.status).toBe(201);
  return json<{ registration_id: string; credential: string }>(res);
}

// ─── Back-channel revocation ─────────────────────────────────────────────────

describe("POST /api/agent/auth/revoke", () => {
  it("revokes a subject's registration and invalidates its credential", async () => {
    await useTrustedProvider();
    const { revoke, listTasks } = await getRoutes();
    const reg = await registerAgentVerified();

    // Sanity: the credential authenticates before revocation.
    expect(
      (await listTasks(makeRequest("/api/tasks", { token: reg.credential }))).status
    ).toBe(200);

    const logout = await mintLogoutToken({ sub: "user-123" });
    const res = await revoke(
      makeRequest("/api/agent/auth/revoke", {
        method: "POST",
        rawBody: logout,
        headers: { "content-type": "application/logout+jwt" },
      })
    );
    expect(res.status).toBe(200);

    // Registration is now marked revoked…
    const [row] = await testDb
      .select({ status: agentRegistration.status })
      .from(agentRegistration)
      .where(eq(agentRegistration.id, reg.registration_id));
    expect(row.status).toBe("revoked");

    // …and the credential no longer authenticates.
    const after = await listTasks(
      makeRequest("/api/tasks", { token: reg.credential })
    );
    expect(after.status).toBe(401);
  });

  it("returns 400 invalid_request for a missing token", async () => {
    await useTrustedProvider();
    const { revoke } = await getRoutes();
    const res = await revoke(
      makeRequest("/api/agent/auth/revoke", { method: "POST", rawBody: "" })
    );
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 invalid_token for a garbage token", async () => {
    await useTrustedProvider();
    const { revoke } = await getRoutes();
    const res = await revoke(
      makeRequest("/api/agent/auth/revoke", {
        method: "POST",
        rawBody: "not.a.jwt",
      })
    );
    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("invalid_token");
  });

  it("rejects a logout token without the revocation event (400)", async () => {
    await useTrustedProvider();
    const { revoke } = await getRoutes();
    const res = await revoke(
      makeRequest("/api/agent/auth/revoke", {
        method: "POST",
        rawBody: await mintLogoutToken({ events: {} }),
      })
    );
    expect(res.status).toBe(400);
  });
});

// ─── Rate limiting ───────────────────────────────────────────────────────────

describe("POST /api/agent/auth — rate limiting", () => {
  async function anon(ip: string) {
    const { register } = await getRoutes();
    return register(
      makeRequest("/api/agent/auth", {
        body: { type: "anonymous", requested_credential_type: "api_key" },
        headers: { "x-forwarded-for": ip },
      })
    );
  }

  it("allows 5 anonymous registrations per IP, then 429s", async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < 5; i++) {
      expect((await anon(ip)).status).toBe(201);
    }
    const sixth = await anon(ip);
    expect(sixth.status).toBe(429);
    const body = await json<{ error: string }>(sixth);
    expect(body.error).toBe("rate_limited");
  });

  it("tracks the limit per-IP (a different IP is unaffected)", async () => {
    const ip1 = "198.51.100.1";
    for (let i = 0; i < 5; i++) await anon(ip1);
    expect((await anon(ip1)).status).toBe(429);

    // Fresh IP still has its full allowance.
    expect((await anon("198.51.100.2")).status).toBe(201);
  });
});
