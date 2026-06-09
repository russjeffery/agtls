import { eq, and, isNotNull, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { user, project, agentRegistration } from "@/lib/db/schema";
import { newId, newUserId } from "@/lib/api/ids";

// User matching, JIT provisioning, and principal (project) creation.
//
// The agtls "principal" that owns agent credentials is a project, which must
// belong to a user. We create an agent-flagged user + project rather than make
// project.userId nullable (which would ripple through the whole ownership
// model). On claim we either reuse the JIT user or rebind the project to a
// matched real user.

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
): Promise<{ userId: string; projectId: string } | null> {
  const [reg] = await db
    .select({
      userId: agentRegistration.userId,
      projectId: agentRegistration.projectId,
    })
    .from(agentRegistration)
    .where(
      and(
        eq(agentRegistration.iss, iss),
        eq(agentRegistration.sub, sub),
        isNotNull(agentRegistration.userId),
        isNotNull(agentRegistration.projectId)
      )
    )
    .orderBy(desc(agentRegistration.createdAt))
    .limit(1);
  if (reg?.userId && reg?.projectId) {
    return { userId: reg.userId, projectId: reg.projectId };
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

export async function createAgentProject(
  userId: string,
  label = "Agent access"
): Promise<string> {
  const id = newId("project");
  const now = new Date();
  const slug = `agent-${nanoid(16).toLowerCase()}`;
  await db.insert(project).values({
    id,
    userId,
    name: label,
    slug,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Rebind a project to a different (matched, real) user. */
export async function reassignProjectOwner(
  projectId: string,
  userId: string
): Promise<void> {
  await db
    .update(project)
    .set({ userId, updatedAt: new Date() })
    .where(eq(project.id, projectId));
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

/**
 * Resolve the principal (user + project) for an agent-verified assertion,
 * following the recommended resolution order: delegation → verified email → JIT.
 */
export async function resolvePrincipalForAssertion(input: {
  iss: string;
  sub: string;
  email?: string;
  emailVerified?: boolean;
}): Promise<{ userId: string; projectId: string; matchType: MatchType }> {
  const delegation = await findDelegationPrincipal(input.iss, input.sub);
  if (delegation) return { ...delegation, matchType: "delegation" };

  if (input.email && input.emailVerified) {
    const matched = await findUserByVerifiedEmail(input.email);
    if (matched) {
      const projectId = await createAgentProject(matched);
      return { userId: matched, projectId, matchType: "email" };
    }
  }

  const userId = await createAgentUser({
    email: input.email ?? null,
    emailVerified: input.emailVerified ?? false,
    name: "Agent (verified)",
  });
  const projectId = await createAgentProject(userId);
  return { userId, projectId, matchType: "jit" };
}
