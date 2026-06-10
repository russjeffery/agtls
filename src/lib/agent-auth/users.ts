import { eq, and, isNotNull, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, agentRegistration } from "@/lib/db/schema";
import { newUserId } from "@/lib/api/ids";
import {
  createOrgWithOwner,
  ensureMember,
  findOrCreatePrimaryOrg,
} from "@/lib/orgs/service";

// User matching, JIT provisioning, and principal (organization) creation.
//
// The agtls "principal" that owns agent credentials is an organization. Every
// agent gets its own user row (JIT, with a synthetic email when none is
// available) and joins an org as a member. When an agent is matched to an
// existing human, the agent user joins the human's primary org — so the human
// can sign in and see every agent with access to their resources.

export type MatchType = "delegation" | "email" | "jit";

/** A user whose email matches and that we have verified. */
export async function findUserByVerifiedEmail(
  email: string
): Promise<string | null> {
  const [u] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), eq(user.emailVerified, true)))
    .limit(1);
  return u?.id ?? null;
}

/** Strongest match: a prior registration for the same (iss, sub) delegation. */
export async function findDelegationPrincipal(
  iss: string,
  sub: string
): Promise<{ userId: string; organizationId: string } | null> {
  const [reg] = await db
    .select({
      userId: agentRegistration.userId,
      organizationId: agentRegistration.organizationId,
    })
    .from(agentRegistration)
    .where(
      and(
        eq(agentRegistration.iss, iss),
        eq(agentRegistration.sub, sub),
        isNotNull(agentRegistration.userId),
        isNotNull(agentRegistration.organizationId)
      )
    )
    .orderBy(desc(agentRegistration.createdAt))
    .limit(1);
  if (reg?.userId && reg?.organizationId) {
    return { userId: reg.userId, organizationId: reg.organizationId };
  }
  return null;
}

export async function createAgentUser(opts: {
  email?: string | null;
  emailVerified?: boolean;
  name?: string;
}): Promise<string> {
  const id = newUserId();
  const now = new Date();
  // user.email is NOT NULL + unique; synthesize a placeholder when absent
  // (anonymous start has no email until the claim completes).
  const email = opts.email ?? `agent-${id}@agents.invalid`;
  await db.insert(user).values({
    id,
    name: opts.name ?? "Agent",
    email,
    emailVerified: opts.emailVerified ?? false,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * A fresh org for an unmatched agent. The agent is its owner member until a
 * human claims it (transferOwnership then demotes the agent to plain member).
 */
export async function createAgentOrg(
  agentUserId: string,
  label = "Agent access"
): Promise<string> {
  return createOrgWithOwner(agentUserId, label);
}

/** Promote a JIT agent user into a verified user with a real email. */
export async function promoteAgentUser(
  userId: string,
  email: string
): Promise<void> {
  await db
    .update(user)
    .set({ email, emailVerified: true, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

export interface ResolvedPrincipal {
  /** The agent's own user row — what the registration and credential bind to. */
  userId: string;
  organizationId: string;
  matchType: MatchType;
  /** The matched human for email matches; otherwise the agent user itself. */
  claimedByUserId: string;
}

/**
 * Resolve the principal (agent user + organization) for an agent-verified
 * assertion, following the recommended resolution order:
 * delegation → verified email → JIT.
 */
export async function resolvePrincipalForAssertion(input: {
  iss: string;
  sub: string;
  email?: string;
  emailVerified?: boolean;
}): Promise<ResolvedPrincipal> {
  const delegation = await findDelegationPrincipal(input.iss, input.sub);
  if (delegation) {
    return {
      ...delegation,
      matchType: "delegation",
      claimedByUserId: delegation.userId,
    };
  }

  if (input.email && input.emailVerified) {
    const matched = await findUserByVerifiedEmail(input.email);
    if (matched) {
      // The agent gets its own user row (synthetic email — the real one
      // belongs to the human) and joins the human's primary org as a member.
      const organizationId = await findOrCreatePrimaryOrg(matched);
      const agentUserId = await createAgentUser({ name: "Agent (verified)" });
      await ensureMember(organizationId, agentUserId, "member");
      return {
        userId: agentUserId,
        organizationId,
        matchType: "email",
        claimedByUserId: matched,
      };
    }
  }

  const userId = await createAgentUser({
    email: input.email ?? null,
    emailVerified: input.emailVerified ?? false,
    name: "Agent (verified)",
  });
  const organizationId = await createAgentOrg(userId);
  return { userId, organizationId, matchType: "jit", claimedByUserId: userId };
}
