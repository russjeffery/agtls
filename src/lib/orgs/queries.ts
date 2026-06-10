import { eq, and, isNull, desc, asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organization,
  member,
  user,
  apiKey,
  agentRegistration,
} from "@/lib/db/schema";

// Read models shared by the dashboard and GET /api/organizations/[id]/members.

export interface OrgMemberView {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: Date;
  /** Agent rather than human: JIT-provisioned user or bound registration. */
  isAgent: boolean;
  /** Registration metadata, when this member is an agent with one. */
  agent: {
    registrationId: string;
    type: "agent-provider" | "anonymous" | "email-verification";
    status: "active" | "unclaimed" | "claimed" | "expired" | "revoked";
    platform: string | null;
    createdAt: Date;
  } | null;
}

export interface OrgKeyView {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[] | null;
  createdByAgent: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface OrgView {
  id: string;
  name: string;
  slug: string;
  role: string;
  createdAt: Date;
  members: OrgMemberView[];
  keys: OrgKeyView[];
}

export async function listOrgMembers(
  organizationId: string
): Promise<OrgMemberView[]> {
  const rows = await db
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      joinedAt: member.createdAt,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(member.createdAt));

  if (rows.length === 0) return [];

  // Latest registration per member user — what tags a member as an agent and
  // carries its platform/status metadata.
  const regs = await db
    .select({
      id: agentRegistration.id,
      userId: agentRegistration.userId,
      type: agentRegistration.type,
      status: agentRegistration.status,
      platform: agentRegistration.agentPlatform,
      createdAt: agentRegistration.createdAt,
    })
    .from(agentRegistration)
    .where(
      inArray(
        agentRegistration.userId,
        rows.map((r) => r.userId)
      )
    )
    .orderBy(desc(agentRegistration.createdAt));

  const regByUser = new Map<string, (typeof regs)[number]>();
  for (const reg of regs) {
    if (reg.userId && !regByUser.has(reg.userId)) regByUser.set(reg.userId, reg);
  }

  return rows.map((row) => {
    const reg = regByUser.get(row.userId);
    const agent = reg
      ? {
          registrationId: reg.id,
          type: reg.type,
          status: reg.status,
          platform: reg.platform,
          createdAt: reg.createdAt,
        }
      : null;
    // A member is an agent when its user row was JIT-provisioned (synthetic
    // @agents.invalid email) or an agent registration is bound to it — the
    // latter covers agents promoted to a real, verified email.
    const isAgent = row.email.endsWith("@agents.invalid") || agent !== null;
    return { ...row, isAgent, agent };
  });
}

export async function listOrgKeys(
  organizationId: string
): Promise<OrgKeyView[]> {
  return db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      createdByAgent: apiKey.createdByAgent,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    })
    .from(apiKey)
    .where(and(eq(apiKey.organizationId, organizationId), isNull(apiKey.revokedAt)))
    .orderBy(desc(apiKey.createdAt));
}

/** Everything the dashboard shows: each org the user belongs to, expanded. */
export async function listUserOrgs(userId: string): Promise<OrgView[]> {
  const memberships = await db
    .select({
      organizationId: member.organizationId,
      role: member.role,
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.createdAt));

  return Promise.all(
    memberships.map(async (m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      role: m.role,
      createdAt: m.createdAt,
      members: await listOrgMembers(m.organizationId),
      keys: await listOrgKeys(m.organizationId),
    }))
  );
}
