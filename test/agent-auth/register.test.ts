import { describe, it, expect, beforeEach } from "vitest";
import { makeRequest, json } from "../helpers/request";
import {
  useTrustedProvider,
  mintIdJag,
  TEST_ISS,
  TEST_AUD,
  TEST_CLIENT,
} from "../helpers/agent-auth";
import { sentEmails, lastClaimViewToken } from "../helpers/email";

// Route handlers — imported once; module-level mocks are already in place via
// test/setup.ts so this import is cheap (no real DB/network).
async function getRoutes() {
  const { POST: register } = await import("@/app/api/agent/auth/route");
  const { GET: listTasks } = await import("@/app/api/tasks/route");
  return { register, listTasks };
}

// ─── Agent-verified (ID-JAG) ──────────────────────────────────────────────────

describe("POST /api/agent/auth — agent-verified (identity_assertion + id-jag)", () => {
  it("registers successfully with api_key credential type and issues usable credential", async () => {
    await useTrustedProvider();
    const { register, listTasks } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion: await mintIdJag(),
          requested_credential_type: "api_key",
        },
      })
    );

    expect(res.status).toBe(201);
    const body = await json<{
      registration_id: string;
      registration_type: string;
      credential_type: string;
      credential: string;
      credential_expires: string | null;
      scopes: string[];
    }>(res);

    expect(body.registration_id).toMatch(/^reg_/);
    expect(body.registration_type).toBe("agent-provider");
    expect(body.credential_type).toBe("api_key");
    expect(body.credential).toMatch(/^agt_/);
    expect(body.credential_expires).toBeNull();
    expect(body.scopes).toEqual(["api.read", "api.write"]);

    // The issued api_key credential authenticates against the resource API.
    const listRes = await listTasks(
      makeRequest("/api/tasks", { token: body.credential })
    );
    expect(listRes.status).toBe(200);
  });

  it("registers successfully with access_token credential type and sets credential_expires", async () => {
    await useTrustedProvider();
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion: await mintIdJag(),
          requested_credential_type: "access_token",
        },
      })
    );

    expect(res.status).toBe(201);
    const body = await json<{
      credential_type: string;
      credential: string;
      credential_expires: string | null;
      scopes: string[];
    }>(res);

    expect(body.credential_type).toBe("access_token");
    expect(body.credential).toMatch(/^agt_/);
    expect(body.credential_expires).not.toBeNull();
    expect(body.scopes).toEqual(["api.read", "api.write"]);
  });

  it("rejects when no trusted provider is configured (invalid_issuer 401)", async () => {
    // Intentionally not calling useTrustedProvider()
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion: await mintIdJag(),
        },
      })
    );

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("invalid_issuer");
  });

  it("detects replay: second request with same jti → replay_detected 401", async () => {
    await useTrustedProvider();
    const { register } = await getRoutes();

    const fixedJti = "replay-test-jti-001";
    const assertion = await mintIdJag({ jti: fixedJti });

    const first = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion,
        },
      })
    );
    expect(first.status).toBe(201);

    const second = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion,
        },
      })
    );
    expect(second.status).toBe(401);
    const body = await json<{ error: string }>(second);
    expect(body.error).toBe("replay_detected");
  });

  it("rejects wrong audience → invalid_audience 401", async () => {
    await useTrustedProvider();
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion: await mintIdJag({ aud: "https://evil.example/" }),
        },
      })
    );

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("invalid_audience");
  });

  it("rejects expired token (expSec in the past) → expired 401", async () => {
    await useTrustedProvider();
    const { register } = await getRoutes();

    const now = Math.floor(Date.now() / 1000);
    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          // exp well beyond clock tolerance (90s)
          assertion: await mintIdJag({ expSec: now - 200, iatSec: now - 500 }),
        },
      })
    );

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("expired");
  });

  it("rejects wrong signing key → invalid_signature 401", async () => {
    await useTrustedProvider();
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion: await mintIdJag({ useWrongKey: true }),
        },
      })
    );

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("invalid_signature");
  });

  it("rejects wrong typ header → invalid_signature 401", async () => {
    await useTrustedProvider();
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion: await mintIdJag({ typ: "JWT" }),
        },
      })
    );

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("invalid_signature");
  });

  it("rejects when neither email_verified nor phone_number_verified → missing_verified_email 400", async () => {
    await useTrustedProvider();
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion: await mintIdJag({
            claims: { email_verified: false, phone_number_verified: false },
          }),
        },
      })
    );

    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("missing_verified_email");
  });

  it("rejects client_id mismatch when provider pins a clientId → invalid_client_id 401", async () => {
    await useTrustedProvider({ clientId: "https://other-client.example.com" });
    const { register } = await getRoutes();

    // mintIdJag defaults to TEST_CLIENT which != the pinned clientId above
    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion: await mintIdJag(),
        },
      })
    );

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("invalid_client_id");
  });
});

// ─── Anonymous ────────────────────────────────────────────────────────────────

describe("POST /api/agent/auth — anonymous", () => {
  it("registers successfully: returns 201 with pre-claim credential, scopes, claim_url, claim_token", async () => {
    const { register, listTasks } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "anonymous",
          requested_credential_type: "api_key",
        },
      })
    );

    expect(res.status).toBe(201);
    const body = await json<{
      registration_id: string;
      registration_type: string;
      credential_type: string;
      credential: string;
      credential_expires: unknown;
      scopes: string[];
      claim_url: string;
      claim_token: string;
      claim_token_expires: string;
      post_claim_scopes: string[];
    }>(res);

    expect(body.registration_id).toMatch(/^reg_/);
    expect(body.registration_type).toBe("anonymous");
    expect(body.credential_type).toBe("api_key");
    expect(body.credential).toMatch(/^agt_/);
    expect(body.credential_expires).toBeNull();
    expect(body.scopes).toEqual(["api.read"]);
    expect(body.claim_url).toContain("/api/agent/auth/claim");
    expect(body.claim_token).toBeTruthy();
    expect(body.post_claim_scopes).toEqual(["api.read", "api.write"]);

    // Pre-claim credential authenticates for read (GET /api/tasks → 200).
    const listRes = await listTasks(
      makeRequest("/api/tasks", { token: body.credential })
    );
    expect(listRes.status).toBe(200);
  });

  it("rejects access_token credential type for anonymous → unsupported_credential_type 400", async () => {
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "anonymous",
          requested_credential_type: "access_token",
        },
      })
    );

    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("unsupported_credential_type");
  });
});

// ─── service_auth ─────────────────────────────────────────────────────────────

describe("POST /api/agent/auth — service_auth (login_hint)", () => {
  it("registers successfully: returns 201 with claim_token, sends email, no credential field", async () => {
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "service_auth",
          login_hint: "agent@example.com",
        },
      })
    );

    expect(res.status).toBe(201);
    const body = await json<{
      registration_id: string;
      registration_type: string;
      claim_token: string;
      claim_url: string;
      post_claim_scopes: string[];
      credential?: unknown;
    }>(res);

    expect(body.registration_id).toMatch(/^reg_/);
    expect(body.registration_type).toBe("service_auth");
    expect(body.claim_token).toBeTruthy();
    expect(body.claim_url).toContain("/api/agent/auth/claim");
    expect(body.post_claim_scopes).toEqual(["api.read", "api.write"]);
    // No credential until the claim is completed.
    expect(body.credential).toBeUndefined();

    // One email must have been sent.
    expect(sentEmails()).toHaveLength(1);
    expect(lastClaimViewToken()).toMatch(/^cvt_/);
  });

  it("rejects a login_hint that isn't a recognizable identifier → invalid_login_hint 400", async () => {
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "service_auth",
          login_hint: "not-a-valid-email",
        },
      })
    );

    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("invalid_login_hint");
  });
});

// ─── Bad request shapes ───────────────────────────────────────────────────────

describe("POST /api/agent/auth — bad request shapes", () => {
  it("unknown type → invalid_request 400", async () => {
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: { type: "magic_beans" },
      })
    );

    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("invalid_request");
  });

  it("identity_assertion with unknown assertion_type → unsupported_type 400", async () => {
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "custom_unknown_type",
          assertion: "some-token",
        },
      })
    );

    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("unsupported_type");
  });

  it("missing required fields → invalid_request 400", async () => {
    const { register } = await getRoutes();

    const res = await register(
      makeRequest("/api/agent/auth", {
        body: {},
      })
    );

    expect(res.status).toBe(400);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("invalid_request");
  });
});
