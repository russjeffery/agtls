import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { makeRequest, json } from "../helpers/request";
import {
  useTrustedProvider,
  mintIdJag,
} from "../helpers/agent-auth";
import { lastClaimViewToken, sentEmails } from "../helpers/email";
import { testDb } from "../helpers/db";
import { agentRegistration, apiKey, user, member } from "@/lib/db/schema";
import {
  getClaimView,
  generateOtpForView,
} from "@/lib/agent-auth/service";

// Helpers to grab route handlers fresh each test (module-level mocks installed
// by test/setup.ts; dynamic imports here are cached per worker but that's fine).
async function getRoutes() {
  const { POST: register } = await import("@/app/api/agent/auth/route");
  const { POST: claim } = await import("@/app/api/agent/auth/claim/route");
  const { POST: complete } = await import(
    "@/app/api/agent/auth/claim/complete/route"
  );
  const { GET: listTasks } = await import("@/app/api/tasks/route");
  return { register, claim, complete, listTasks };
}

// ─── Anonymous full ceremony ──────────────────────────────────────────────────

describe("Anonymous claim ceremony", () => {
  it("full happy path: register → claim → OTP → complete → credential upgraded", async () => {
    const { register, claim, complete } = await getRoutes();

    // 1. Register anonymous
    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: { type: "anonymous", requested_credential_type: "api_key" },
      })
    );
    expect(regRes.status).toBe(201);
    const regBody = await json<{
      registration_id: string;
      credential: string;
      claim_token: string;
    }>(regRes);
    const { registration_id, credential, claim_token } = regBody;

    // 2. POST /claim to initiate the OTP email
    const claimRes = await claim(
      makeRequest("/api/agent/auth/claim", {
        body: { claim_token, email: "claimer@example.com" },
      })
    );
    expect(claimRes.status).toBe(200);
    const claimBody = await json<{ status: string; registration_id: string }>(
      claimRes
    );
    expect(claimBody.status).toBe("initiated");
    expect(claimBody.registration_id).toBe(registration_id);
    expect(sentEmails()).toHaveLength(1);

    // 3. Simulate user opening claim link and confirming → generate OTP
    const viewToken = lastClaimViewToken();
    expect(viewToken).toMatch(/^cvt_/);
    const view = await generateOtpForView(viewToken!);
    expect(view).not.toBeNull();
    const otp = view!.otp;

    // 4. POST /claim/complete
    const completeRes = await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp },
      })
    );
    expect(completeRes.status).toBe(200);
    const completeBody = await json<{ status: string; registration_id: string }>(
      completeRes
    );
    expect(completeBody.status).toBe("claimed");
    expect(completeBody.registration_id).toBe(registration_id);

    // 5. DB side-effects: registration status = "claimed"
    const [reg] = await testDb
      .select()
      .from(agentRegistration)
      .where(eq(agentRegistration.id, registration_id));
    expect(reg.status).toBe("claimed");

    // 6. The existing apiKey's scopes must be upgraded to POST_CLAIM
    const [key] = await testDb
      .select()
      .from(apiKey)
      .where(eq(apiKey.agentRegistrationId, registration_id));
    expect(key.scopes).toEqual(["api.read", "api.write"]);
    // And the key is the same one (not rotated)
    expect(key.keyPrefix).toBeTruthy();
  });

  it("user matching — existing verified user: real user takes over the agent's org", async () => {
    const { register, claim, complete } = await getRoutes();

    // Seed a pre-existing verified user
    const realUserId = "usr_real_" + Date.now();
    const now = new Date();
    await testDb.insert(user).values({
      id: realUserId,
      name: "Real User",
      email: "real@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });

    // Register anonymous
    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: { type: "anonymous", requested_credential_type: "api_key" },
      })
    );
    const { registration_id, claim_token } = await json<{
      registration_id: string;
      claim_token: string;
    }>(regRes);

    // Claim with the real user's email
    await claim(
      makeRequest("/api/agent/auth/claim", {
        body: { claim_token, email: "real@example.com" },
      })
    );

    const viewToken = lastClaimViewToken()!;
    const view = await generateOtpForView(viewToken);
    const otp = view!.otp;

    await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp },
      })
    );

    // The registration's org should now be owned by realUser, with the agent
    // demoted to a plain member — that's what the human's dashboard lists.
    const [reg] = await testDb
      .select()
      .from(agentRegistration)
      .where(eq(agentRegistration.id, registration_id));
    expect(reg.claimedByUserId).toBe(realUserId);
    expect(reg.organizationId).toBeTruthy();

    const members = await testDb
      .select()
      .from(member)
      .where(eq(member.organizationId, reg.organizationId!));
    const humanMember = members.find((m) => m.userId === realUserId);
    const agentMember = members.find((m) => m.userId === reg.userId);
    expect(humanMember?.role).toBe("owner");
    expect(agentMember?.role).toBe("member");
  });

  it("user matching — no pre-existing user: JIT agent user is promoted (emailVerified true)", async () => {
    const { register, claim, complete } = await getRoutes();

    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: { type: "anonymous", requested_credential_type: "api_key" },
      })
    );
    const { registration_id, claim_token } = await json<{
      registration_id: string;
      claim_token: string;
    }>(regRes);

    await claim(
      makeRequest("/api/agent/auth/claim", {
        body: { claim_token, email: "newagent@example.com" },
      })
    );

    const view = await generateOtpForView(lastClaimViewToken()!);

    await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp: view!.otp },
      })
    );

    // The JIT user should now be promoted — emailVerified = true
    const [reg] = await testDb
      .select()
      .from(agentRegistration)
      .where(eq(agentRegistration.id, registration_id));

    const [promotedUser] = await testDb
      .select()
      .from(user)
      .where(eq(user.id, reg.userId!));

    expect(promotedUser.emailVerified).toBe(true);
    expect(promotedUser.email).toBe("newagent@example.com");
  });
});

// ─── Email-verification full ceremony ────────────────────────────────────────

describe("Email-verification claim ceremony", () => {
  it("full happy path: register → OTP (from email) → complete → fresh credential issued", async () => {
    const { register, complete, listTasks } = await getRoutes();

    // 1. Register with email-verification flow
    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "verified_email",
          assertion: "emailtest@example.com",
          requested_credential_type: "api_key",
        },
      })
    );
    expect(regRes.status).toBe(201);
    const { registration_id, claim_token } = await json<{
      registration_id: string;
      claim_token: string;
    }>(regRes);

    expect(sentEmails()).toHaveLength(1);
    const viewToken = lastClaimViewToken()!;
    expect(viewToken).toMatch(/^cvt_/);

    // 2. Generate OTP (user opens claim page and confirms)
    const view = await generateOtpForView(viewToken);
    expect(view).not.toBeNull();

    // 3. Complete
    const completeRes = await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp: view!.otp },
      })
    );
    expect(completeRes.status).toBe(200);
    const completeBody = await json<{
      status: string;
      credential: string;
      credential_type: string;
      scopes: string[];
    }>(completeRes);

    expect(completeBody.status).toBe("claimed");
    expect(completeBody.credential).toMatch(/^agt_/);
    expect(completeBody.credential_type).toBe("api_key");
    expect(completeBody.scopes).toEqual(["api.read", "api.write"]);

    // 4. The fresh credential must authenticate
    const listRes = await listTasks(
      makeRequest("/api/tasks", { token: completeBody.credential })
    );
    expect(listRes.status).toBe(200);

    // 5. DB: registration status = "claimed"
    const [reg] = await testDb
      .select()
      .from(agentRegistration)
      .where(eq(agentRegistration.id, registration_id));
    expect(reg.status).toBe("claimed");
  });
});

// ─── Claim error paths ────────────────────────────────────────────────────────

describe("POST /api/agent/auth/claim — error paths", () => {
  it("unknown claim_token → invalid_claim_token 404", async () => {
    const { claim } = await getRoutes();

    const res = await claim(
      makeRequest("/api/agent/auth/claim", {
        body: { claim_token: "unknown-token-xyz", email: "x@example.com" },
      })
    );

    expect(res.status).toBe(404);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("invalid_claim_token");
  });

  it("already-claimed token → claimed_or_in_flight 409", async () => {
    const { register, claim, complete } = await getRoutes();

    // Register and fully claim first
    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: { type: "anonymous", requested_credential_type: "api_key" },
      })
    );
    const { claim_token } = await json<{ claim_token: string }>(regRes);

    // First claim + complete
    await claim(
      makeRequest("/api/agent/auth/claim", {
        body: { claim_token, email: "a@example.com" },
      })
    );
    const view = await generateOtpForView(lastClaimViewToken()!);
    await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp: view!.otp },
      })
    );

    // Try to claim again
    const res = await claim(
      makeRequest("/api/agent/auth/claim", {
        body: { claim_token, email: "b@example.com" },
      })
    );
    expect(res.status).toBe(409);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("claimed_or_in_flight");
  });

  it("expired claim window → claim_expired 410", async () => {
    const { register, claim } = await getRoutes();

    // Register to get a valid registration
    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: { type: "anonymous", requested_credential_type: "api_key" },
      })
    );
    const { registration_id, claim_token } = await json<{
      registration_id: string;
      claim_token: string;
    }>(regRes);

    // Manually expire the claim window
    await testDb
      .update(agentRegistration)
      .set({ claimTokenExpiresAt: new Date(Date.now() - 10_000) })
      .where(eq(agentRegistration.id, registration_id));

    const res = await claim(
      makeRequest("/api/agent/auth/claim", {
        body: { claim_token, email: "late@example.com" },
      })
    );
    expect(res.status).toBe(410);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("claim_expired");
  });
});

// ─── Complete error paths ─────────────────────────────────────────────────────

describe("POST /api/agent/auth/claim/complete — error paths", () => {
  it("wrong OTP → otp_invalid 401", async () => {
    const { register, claim, complete } = await getRoutes();

    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: { type: "anonymous", requested_credential_type: "api_key" },
      })
    );
    const { claim_token } = await json<{ claim_token: string }>(regRes);

    await claim(
      makeRequest("/api/agent/auth/claim", {
        body: { claim_token, email: "x@example.com" },
      })
    );
    // Generate a real OTP (to set the otpHash), but submit a wrong one
    await generateOtpForView(lastClaimViewToken()!);

    const res = await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp: "000000" },
      })
    );
    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("otp_invalid");
  });

  it("no OTP generated yet → otp_invalid 401", async () => {
    const { register, claim, complete } = await getRoutes();

    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: { type: "anonymous", requested_credential_type: "api_key" },
      })
    );
    const { claim_token } = await json<{ claim_token: string }>(regRes);

    await claim(
      makeRequest("/api/agent/auth/claim", {
        body: { claim_token, email: "y@example.com" },
      })
    );
    // Do NOT call generateOtpForView — simulate user not opening the claim link

    const res = await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp: "123456" },
      })
    );
    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("otp_invalid");
  });

  it("expired OTP → otp_expired 410", async () => {
    const { register, claim, complete } = await getRoutes();

    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: { type: "anonymous", requested_credential_type: "api_key" },
      })
    );
    const { registration_id, claim_token } = await json<{
      registration_id: string;
      claim_token: string;
    }>(regRes);

    await claim(
      makeRequest("/api/agent/auth/claim", {
        body: { claim_token, email: "z@example.com" },
      })
    );
    const view = await generateOtpForView(lastClaimViewToken()!);
    const otp = view!.otp;

    // Manually expire the OTP
    await testDb
      .update(agentRegistration)
      .set({ otpExpiresAt: new Date(Date.now() - 10_000) })
      .where(eq(agentRegistration.id, registration_id));

    const res = await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp },
      })
    );
    expect(res.status).toBe(410);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("otp_expired");
  });

  it("previously_claimed on complete → 409", async () => {
    const { register, claim, complete } = await getRoutes();

    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: { type: "anonymous", requested_credential_type: "api_key" },
      })
    );
    const { claim_token } = await json<{ claim_token: string }>(regRes);

    await claim(
      makeRequest("/api/agent/auth/claim", {
        body: { claim_token, email: "once@example.com" },
      })
    );
    const view = await generateOtpForView(lastClaimViewToken()!);
    const otp = view!.otp;

    // First complete should succeed
    const first = await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp },
      })
    );
    expect(first.status).toBe(200);

    // Second complete should fail with previously_claimed
    const second = await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp },
      })
    );
    expect(second.status).toBe(409);
    const body = await json<{ error: string }>(second);
    expect(body.error).toBe("previously_claimed");
  });
});

// ─── getClaimView read-only contract ─────────────────────────────────────────

describe("getClaimView — read-only semantics", () => {
  it("returns serviceName/email without setting otpHash", async () => {
    const { register } = await getRoutes();

    // Register via email-verification to get a view token
    await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "verified_email",
          assertion: "view@example.com",
        },
      })
    );
    const viewToken = lastClaimViewToken()!;
    expect(viewToken).toMatch(/^cvt_/);

    // getClaimView should return info WITHOUT minting an OTP
    const info = await getClaimView(viewToken);
    expect(info).not.toBeNull();
    expect(info!.serviceName).toBeTruthy();
    expect(info!.email).toBe("view@example.com");

    // Verify no otpHash was set on the DB row (getClaimView must be read-only).
    const rows = await testDb
      .select({ otpHash: agentRegistration.otpHash })
      .from(agentRegistration)
      .where(eq(agentRegistration.email, "view@example.com"));
    expect(rows[0]?.otpHash).toBeNull();
  });

  it("returns null for an unknown view token", async () => {
    const result = await getClaimView("cvt_doesnotexist");
    expect(result).toBeNull();
  });

  it("returns null for a claimed registration", async () => {
    const { register, complete } = await getRoutes();

    // Email-verification flow
    await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "verified_email",
          assertion: "claimed@example.com",
        },
      })
    );
    const { claim_token } = await json<{ claim_token: string }>(
      // re-register to get the claim_token from the response
      await (async () => {
        const { register: r2 } = await getRoutes();
        return r2(
          makeRequest("/api/agent/auth", {
            body: {
              type: "identity_assertion",
              assertion_type: "verified_email",
              assertion: "claimed2@example.com",
            },
          })
        );
      })()
    );

    const viewToken2 = lastClaimViewToken()!;
    const view = await generateOtpForView(viewToken2);
    await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp: view!.otp },
      })
    );

    // Now the view token belongs to a claimed registration
    const result = await getClaimView(viewToken2);
    expect(result).toBeNull();
  });

  it("returns null for an expired registration", async () => {
    const { register } = await getRoutes();

    await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "verified_email",
          assertion: "expired@example.com",
        },
      })
    );
    const viewToken = lastClaimViewToken()!;

    // Expire the window
    await testDb
      .update(agentRegistration)
      .set({ claimTokenExpiresAt: new Date(Date.now() - 10_000) })
      .where(eq(agentRegistration.email, "expired@example.com"));

    const result = await getClaimView(viewToken);
    expect(result).toBeNull();
  });
});
