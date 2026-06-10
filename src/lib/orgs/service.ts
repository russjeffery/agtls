import { eq, and, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { organization, member } from "@/lib/db/schema";
import { newId } from "@/lib/api/ids";

// Organization membership helpers shared by BetterAuth hooks, agent-auth, and
// the dashboard routes. These write the org-plugin tables directly with
// Drizzle rather than going through `auth.api.*`: the signup hook runs inside
// the BetterAuth config (so it can't reference `auth`), agent users have no
// session, and direct writes keep every path idempotent (the plugin's
// addMember endpoint throws on repeat membership).

export type OrgRole = "owner" | "admin" | "member";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return `${base || "org"}-${nanoid(8).toLowerCase()}`;
}

/** Create an organization with `userId` as its owner member. */
export async function createOrgWithOwner(
  userId: string,
  name: string,
  slug?: string
): Promise<string> {
  const orgId = newId("organization");
  await db.insert(organization).values({
    id: orgId,
    name,
    slug: slug ?? slugify(name),
    createdAt: new Date(),
  });
  await db.insert(member).values({
    id: newId("member"),
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
  return orgId;
}

/** The caller's member row in the org, or null when not a member. */
export async function getMembership(
  organizationId: string,
  userId: string
): Promise<{ id: string; role: string } | null> {
  const [row] = await db
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId))
    )
    .limit(1);
  return row ?? null;
}

/** Add `userId` to the org with `role` — a no-op when already a member. */
export async function ensureMember(
  organizationId: string,
  userId: string,
  role: OrgRole = "member"
): Promise<void> {
  const [existing] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.userId, userId))
    )
    .limit(1);
  if (existing) return;
  await db.insert(member).values({
    id: newId("member"),
    organizationId,
    userId,
    role,
    createdAt: new Date(),
  });
}

/**
 * The user's primary organization — the oldest one they own — or a fresh org
 * when they own none. Used when an agent is matched to an existing user so the
 * agent's credential lands in the org the human already works in.
 */
export async function findOrCreatePrimaryOrg(userId: string): Promise<string> {
  const [existing] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.role, "owner")))
    .orderBy(asc(member.createdAt))
    .limit(1);
  if (existing) return existing.organizationId;
  return createOrgWithOwner(userId, "Personal");
}

/**
 * Hand an agent-created org to a matched human: the human becomes (or stays)
 * owner and the agent's member row is demoted to plain `member`, so the
 * dashboard shows the agent as a member of the human's org.
 */
export async function transferOwnership(
  organizationId: string,
  humanUserId: string,
  agentUserId: string
): Promise<void> {
  await ensureMember(organizationId, humanUserId, "owner");
  await db
    .update(member)
    .set({ role: "owner" })
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, humanUserId)
      )
    );
  await db
    .update(member)
    .set({ role: "member" })
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, agentUserId)
      )
    );
}
