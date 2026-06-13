import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { makeRequest, json } from "../helpers/request";
import { testDb } from "../helpers/db";
import { agentRegistration, apiKey, user, member } from "@/lib/db/schema";
import {
  getDirectClaimView,
  completeDirectClaim,
} from "@/lib/agent-auth/service";
import { AgentAuthError } from "@/lib/agent-auth/errors";

// The direct claim-link flow: an agent registers anonymously, gets a
// human-facing `claim_link`, and a signed-in human opens it and claims the
// agent in-session — no email/OTP. See service.ts (getDirectClaimView /
// completeDirectClaim) and /agent/link/[token].

async function getRoutes() {
  const { POST: register } = await import("@/app/api/agent/auth/route");
  const { POST: claimLink } = await import(
    "@/app/api/agent/auth/claim-link/route"
  );
  const { GET: listTasks } = await import("@/app/api/tasks/route");
  return { register, claimLink, listTasks };
}

function tokenFromLink(claimLink: string): string {
  const t = claimLink.split("/agent/link/")[1];
  if (!t) throw new Error(`no view token in claim_link: ${claimLink}`);
  return t;
}

async function registerAnon() {
  const { register } = await getRoutes();
  const res = await register(
    makeRequest("/api/agent/auth", { body: { type: "anonymous" } })
  );
  return json<{
    registration_id: string;
    credential: string;
    claim_link: string;
  }>(res);
}

async function seedUser(email: string): Promise<string> {
  const id = "usr_human_" + Math.random().toString(36).slice(2);
  const now = new Date();
  await testDb.insert(user).values({
    id,
    name: "Human",
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

describe("Anonymous registration → claim_link", () => {
  it("returns a human-facing claim_link alongside the credential", async () => {
    const body = await registerAnon();
    expect(body.credential).toMatch(/^agt_/);
    expect(body.claim_link).toMatch(
      /^https:\/\/app\.example\.com\/agent\/link\/cvt_/
    );
  });
});

describe("POST /api/agent/auth/claim-link", () => {
  it("mints a fresh link for an authenticated anonymous credential", async () => {
    const { claimLink } = await getRoutes();
    const { credential, claim_link: original } = await registerAnon();

    const res = await claimLink(
      makeRequest("/api/agent/auth/claim-link", { token: credential })
    );
    expect(res.status).toBe(201);
    const body = await json<{ claim_link: string }>(res);
    expect(body.claim_link).toMatch(/\/agent\/link\/cvt_/);
    // A fresh token, not the registration's original.
    expect(body.claim_link).not.toBe(original);
  });

  it("401 without a credential", async () => {
    const { claimLink } = await getRoutes();
    const res = await claimLink(makeRequest("/api/agent/auth/claim-link"));
    expect(res.status).toBe(401);
  });

  it("rejects an already-claimed credential", async () => {
    const { claimLink } = await getRoutes();
    const { credential, claim_link } = await registerAnon();
    const humanId = await seedUser("owner@example.com");
    await completeDirectClaim(tokenFromLink(claim_link), humanId);

    const res = await claimLink(
      makeRequest("/api/agent/auth/claim-link", { token: credential })
    );
    expect(res.status).toBe(409);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe("previously_claimed");
  });
});

describe("getDirectClaimView — read-only", () => {
  it("returns serviceName for a live link", async () => {
    const { claim_link } = await registerAnon();
    const view = await getDirectClaimView(tokenFromLink(claim_link));
    expect(view?.serviceName).toBeTruthy();
  });

  it("returns null for unknown / claimed / expired links", async () => {
    expect(await getDirectClaimView("cvt_unknown")).toBeNull();

    const claimed = await registerAnon();
    const humanId = await seedUser("a@example.com");
    await completeDirectClaim(tokenFromLink(claimed.claim_link), humanId);
    expect(await getDirectClaimView(tokenFromLink(claimed.claim_link))).toBeNull();

    const expired = await registerAnon();
    await testDb
      .update(agentRegistration)
      .set({ claimTokenExpiresAt: new Date(Date.now() - 10_000) })
      .where(eq(agentRegistration.id, expired.registration_id));
    expect(await getDirectClaimView(tokenFromLink(expired.claim_link))).toBeNull();
  });
});

describe("completeDirectClaim", () => {
  it("transfers org ownership to the human, demotes the agent, upgrades scopes", async () => {
    const { registration_id, claim_link } = await registerAnon();
    const humanId = await seedUser("claimer@example.com");

    const result = await completeDirectClaim(tokenFromLink(claim_link), humanId);
    expect(result.status).toBe("claimed");

    const [reg] = await testDb
      .select()
      .from(agentRegistration)
      .where(eq(agentRegistration.id, registration_id));
    expect(reg.status).toBe("claimed");
    expect(reg.claimedByUserId).toBe(humanId);

    const members = await testDb
      .select()
      .from(member)
      .where(eq(member.organizationId, reg.organizationId!));
    expect(members.find((m) => m.userId === humanId)?.role).toBe("owner");
    expect(members.find((m) => m.userId === reg.userId)?.role).toBe("member");

    const [key] = await testDb
      .select()
      .from(apiKey)
      .where(eq(apiKey.agentRegistrationId, registration_id));
    expect(key.scopes).toEqual(["api.read", "api.write"]);
  });

  it("rejects a second claim (previously_claimed)", async () => {
    const { claim_link } = await registerAnon();
    const human1 = await seedUser("first@example.com");
    const human2 = await seedUser("second@example.com");
    await completeDirectClaim(tokenFromLink(claim_link), human1);

    await expect(
      completeDirectClaim(tokenFromLink(claim_link), human2)
    ).rejects.toMatchObject({
      constructor: AgentAuthError,
      code: "previously_claimed",
    });
  });

  it("rejects an expired link", async () => {
    const { registration_id, claim_link } = await registerAnon();
    const humanId = await seedUser("late@example.com");
    await testDb
      .update(agentRegistration)
      .set({ claimTokenExpiresAt: new Date(Date.now() - 10_000) })
      .where(eq(agentRegistration.id, registration_id));

    await expect(
      completeDirectClaim(tokenFromLink(claim_link), humanId)
    ).rejects.toMatchObject({ code: "claim_expired" });
  });
});
