import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { makeRequest, json } from "../helpers/request";
import { seedOrganization } from "../helpers/seed";
import { mockSession } from "../helpers/session";
import { useTrustedProvider, mintIdJag } from "../helpers/agent-auth";
import { sentEmails, lastClaimViewToken } from "../helpers/email";
import { testDb } from "../helpers/db";
import { user, member, apiKey } from "@/lib/db/schema";
import { auth } from "@/lib/auth/server";
import { generateOtpForView } from "@/lib/agent-auth/service";

// Human sign-up (BetterAuth email/password) and the human↔agent account
// convergence: agents that authenticate with a human's verified email must
// join the human's existing organization as members — visible on the
// human's dashboard — not land in a parallel org.

describe("human email sign-up", () => {
  it("creates a user via BetterAuth and sends a verification email", async () => {
    const email = `human-${Date.now()}@example.com`;
    const res = await auth.api.signUpEmail({
      body: { name: "Human", email, password: "hunter2hunter2" },
    });
    expect(res.user.email).toBe(email);

    const [row] = await testDb.select().from(user).where(eq(user.email, email));
    expect(row).toBeTruthy();
    expect(row.emailVerified).toBe(false);

    // sendOnSignUp wires through src/lib/email.ts (captured in tests).
    const verification = sentEmails().find((m) => m.to === email);
    expect(verification).toBeTruthy();
    expect(verification!.subject).toContain("Verify");
  });

  it("auto-creates a personal org with the human as owner", async () => {
    const email = `org-auto-${Date.now()}@example.com`;
    const res = await auth.api.signUpEmail({
      body: { name: "Org Auto", email, password: "hunter2hunter2" },
    });

    const memberships = await testDb
      .select()
      .from(member)
      .where(eq(member.userId, res.user.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("owner");
  });

  it("rejects duplicate sign-ups for the same email", async () => {
    const email = `dupe-${Date.now()}@example.com`;
    await auth.api.signUpEmail({
      body: { name: "First", email, password: "hunter2hunter2" },
    });
    await expect(
      auth.api.signUpEmail({
        body: { name: "Second", email, password: "hunter2hunter2" },
      })
    ).rejects.toThrow();
  });
});

describe("humans and agents share an organization", () => {
  it("email-verification agent claim joins the human's existing org as a member", async () => {
    // A human with an org and an owned task.
    const human = await seedOrganization();
    const [seedUser] = await testDb
      .select()
      .from(user)
      .where(eq(user.id, human.userId));
    const { POST: createTask } = await import("@/app/api/tasks/route");
    await createTask(
      makeRequest("/api/tasks", { body: { name: "Human's task" }, token: human.key })
    );

    // An agent registers with the human's (verified) email.
    const { POST: register } = await import("@/app/api/agent/auth/route");
    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "verified_email",
          assertion: seedUser.email,
          requested_credential_type: "api_key",
        },
      })
    );
    expect(regRes.status).toBe(201);
    const { claim_token } = await json<{ claim_token: string }>(regRes);

    // Human confirms via the emailed OTP.
    const viewToken = lastClaimViewToken()!;
    const view = await generateOtpForView(viewToken);
    const { POST: complete } = await import(
      "@/app/api/agent/auth/claim/complete/route"
    );
    const completeRes = await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp: view!.otp },
      })
    );
    expect(completeRes.status).toBe(200);
    const { credential } = await json<{ credential: string }>(completeRes);

    // The agent credential is bound to the human's existing org…
    const [keyRow] = await testDb
      .select()
      .from(apiKey)
      .where(eq(apiKey.keyHash, hash(credential)));
    expect(keyRow.organizationId).toBe(human.organizationId);

    // …the agent is a distinct member of that org (human stays owner)…
    const members = await testDb
      .select()
      .from(member)
      .where(eq(member.organizationId, human.organizationId));
    const agentMembers = members.filter((m) => m.userId !== human.userId);
    expect(agentMembers).toHaveLength(1);
    expect(agentMembers[0].role).toBe("member");
    const humanMember = members.find((m) => m.userId === human.userId);
    expect(humanMember?.role).toBe("owner");

    // …so the agent sees the human's resources.
    const { GET: listTasks } = await import("@/app/api/tasks/route");
    const listRes = await listTasks(makeRequest("/api/tasks", { token: credential }));
    const list = await json<{ data: { name: string }[] }>(listRes);
    expect(list.data.map((t) => t.name)).toContain("Human's task");
  });

  it("ID-JAG agent with a matching verified email lands in the human's org", async () => {
    const human = await seedOrganization();
    const [seedUser] = await testDb
      .select()
      .from(user)
      .where(eq(user.id, human.userId));

    await useTrustedProvider();
    const assertion = await mintIdJag({
      claims: { email: seedUser.email, email_verified: true },
    });

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
    const { credential } = await json<{ credential: string }>(regRes);

    const [keyRow] = await testDb
      .select()
      .from(apiKey)
      .where(eq(apiKey.keyHash, hash(credential)));
    expect(keyRow.organizationId).toBe(human.organizationId);
  });

  it("agent claiming a fresh human's email joins the auto-created org the human sees", async () => {
    // Human signs up (auto-creating their personal org) and verifies their
    // email (simulate clicking the link).
    const email = `fresh-${Date.now()}@example.com`;
    const signedUp = await auth.api.signUpEmail({
      body: { name: "Fresh Human", email, password: "hunter2hunter2" },
    });
    await testDb
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, signedUp.user.id));

    // Agent registers + claims with that email.
    const { POST: register } = await import("@/app/api/agent/auth/route");
    const regRes = await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "verified_email",
          assertion: email,
          requested_credential_type: "api_key",
        },
      })
    );
    const { claim_token } = await json<{ claim_token: string }>(regRes);
    const view = await generateOtpForView(lastClaimViewToken()!);
    const { POST: complete } = await import(
      "@/app/api/agent/auth/claim/complete/route"
    );
    await complete(
      makeRequest("/api/agent/auth/claim/complete", {
        body: { claim_token, otp: view!.otp },
      })
    );

    // The agent landed in the org the human owns…
    const [humanMembership] = await testDb
      .select()
      .from(member)
      .where(
        and(eq(member.userId, signedUp.user.id), eq(member.role, "owner"))
      );
    expect(humanMembership).toBeTruthy();
    const orgId = humanMembership.organizationId;

    const members = await testDb
      .select()
      .from(member)
      .where(eq(member.organizationId, orgId));
    const agentMember = members.find((m) => m.userId !== signedUp.user.id);
    expect(agentMember?.role).toBe("member");

    // …and the org shows up in the human's session-authenticated list.
    mockSession(signedUp.user.id, email);
    const { GET: listOrgs } = await import("@/app/api/organizations/route");
    const res = await listOrgs(makeRequest("/api/organizations"));
    expect(res.status).toBe(200);
    const body = await json<{ data: { id: string }[] }>(res);
    expect(body.data.map((o) => o.id)).toContain(orgId);
  });

  it("a second agent claim reuses the same org instead of minting another", async () => {
    const human = await seedOrganization();
    const [seedUser] = await testDb
      .select()
      .from(user)
      .where(eq(user.id, human.userId));

    await useTrustedProvider();
    for (const ctx of ["ctx-a", "ctx-b"]) {
      const assertion = await mintIdJag({
        claims: {
          sub: `subject-${ctx}`,
          email: seedUser.email,
          email_verified: true,
          agent_context_id: ctx,
        },
      });
      const { POST: register } = await import("@/app/api/agent/auth/route");
      const res = await register(
        makeRequest("/api/agent/auth", {
          body: {
            type: "identity_assertion",
            assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
            assertion,
          },
        })
      );
      expect(res.status).toBe(201);
    }

    // Still exactly one org the human owns; both agents joined it as members.
    const owned = await testDb
      .select()
      .from(member)
      .where(and(eq(member.userId, human.userId), eq(member.role, "owner")));
    expect(owned).toHaveLength(1);

    const members = await testDb
      .select()
      .from(member)
      .where(eq(member.organizationId, human.organizationId));
    const agents = members.filter((m) => m.userId !== human.userId);
    expect(agents).toHaveLength(2);
    expect(agents.every((m) => m.role === "member")).toBe(true);
  });

  it("the members endpoint shows the agent to the signed-in human", async () => {
    const human = await seedOrganization();
    const [seedUser] = await testDb
      .select()
      .from(user)
      .where(eq(user.id, human.userId));

    await useTrustedProvider();
    const assertion = await mintIdJag({
      claims: { email: seedUser.email, email_verified: true },
    });
    const { POST: register } = await import("@/app/api/agent/auth/route");
    await register(
      makeRequest("/api/agent/auth", {
        body: {
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion,
        },
      })
    );

    mockSession(human.userId, seedUser.email);
    const { GET: listMembers } = await import(
      "@/app/api/organizations/[id]/members/route"
    );
    const res = await listMembers(
      makeRequest(`/api/organizations/${human.organizationId}/members`),
      { params: Promise.resolve({ id: human.organizationId }) }
    );
    expect(res.status).toBe(200);
    const body = await json<{
      data: { user_id: string; is_agent: boolean; role: string; agent: { type: string } | null }[];
    }>(res);

    const agentRow = body.data.find((m) => m.is_agent);
    expect(agentRow).toBeTruthy();
    expect(agentRow!.role).toBe("member");
    expect(agentRow!.agent?.type).toBe("agent-provider");

    const humanRow = body.data.find((m) => m.user_id === human.userId);
    expect(humanRow?.is_agent).toBe(false);
    expect(humanRow?.role).toBe("owner");
  });

  it("non-members get a 404 from the members endpoint", async () => {
    const orgA = await seedOrganization();
    const stranger = await seedOrganization();

    mockSession(stranger.userId);
    const { GET: listMembers } = await import(
      "@/app/api/organizations/[id]/members/route"
    );
    const res = await listMembers(
      makeRequest(`/api/organizations/${orgA.organizationId}/members`),
      { params: Promise.resolve({ id: orgA.organizationId }) }
    );
    expect(res.status).toBe(404);
  });
});

describe("agent skill document", () => {
  it("serves a markdown skill with the registration endpoint", async () => {
    const { GET } = await import("@/app/api/discovery/agent-skill/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain('{"type": "anonymous"}');
    expect(text).toContain("/api/agent/auth");
    expect(text).toContain("/api/claim/");
  });
});

function hash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
