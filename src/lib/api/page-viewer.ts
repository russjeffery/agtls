import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, member } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";

/**
 * The signed-in human for a Server Component page, plus the organizations they
 * belong to. Mirrors the session branch of `resolveViewer` (src/lib/api/
 * middleware.ts) but reads the BetterAuth cookie via `headers()` instead of a
 * Request, so it can be called directly from a `page.tsx`. Returns null when no
 * one is signed in — callers redirect to /sign-in.
 */
export interface PageViewer {
  user: { id: string; name: string; email: string };
  /** Orgs the user is a member of — the scope a page may list/read resources from. */
  organizationIds: string[];
  /** Org new resources are created under (active org, else oldest membership). */
  activeOrganizationId: string | null;
}

export async function getPageViewer(): Promise<PageViewer | null> {
  const session = await betterAuth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const memberships = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, session.user.id))
    .orderBy(member.createdAt);

  const organizationIds = memberships.map((m) => m.organizationId);
  const active = session.session.activeOrganizationId ?? null;
  const activeOrganizationId =
    active && organizationIds.includes(active)
      ? active
      : organizationIds[0] ?? null;

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
    },
    organizationIds,
    activeOrganizationId,
  };
}
