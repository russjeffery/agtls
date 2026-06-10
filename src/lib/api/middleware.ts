import { createHash } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db, apiKey, organization, member } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";

export interface AuthContext {
  organizationId: string;
  organization: typeof organization.$inferSelect;
  apiKeyId: string;
  // Scope set for agent-auth credentials. `null` means an unscoped legacy key
  // (full access). Scope enforcement on resource routes is not wired up yet —
  // this surfaces the scopes so callers can introspect them.
  scopes: string[] | null;
}

/** A logged-in human (BetterAuth browser session). */
export interface SessionContext {
  userId: string;
  name: string;
  email: string;
  /** Orgs this user is a member of — a session can see resources in any of them. */
  organizationIds: string[];
}

/**
 * Unified caller identity for resource routes. At most one of `auth` /
 * `session` is set: a Bearer API key wins, otherwise we look for a browser
 * session cookie. Both null = anonymous (public access only).
 */
export interface Viewer {
  auth: AuthContext | null;
  session: SessionContext | null;
}

/**
 * Extract and validate API key from Authorization header.
 * Returns null for unauthenticated requests (public access).
 * Throws with a message string if the key is present but invalid.
 */
export async function resolveAuth(
  request: Request
): Promise<AuthContext | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new Error("Authorization header must use Bearer scheme.");
  }

  if (!token.startsWith("agt_")) {
    throw new Error("Invalid API key format.");
  }

  const keyHash = createHash("sha256").update(token).digest("hex");

  const rows = await db
    .select({
      key: apiKey,
      org: organization,
    })
    .from(apiKey)
    .innerJoin(organization, eq(apiKey.organizationId, organization.id))
    .where(and(eq(apiKey.keyHash, keyHash), isNull(apiKey.revokedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("The API key provided is invalid or has been revoked.");
  }

  const { key, org } = rows[0];

  // Access-token credentials (agent-auth) carry an expiry; reject once past it.
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
    throw new Error("The API key provided has expired.");
  }

  // Fire-and-forget last_used_at update
  db.update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, key.id))
    .execute()
    .catch(() => {});

  return {
    organizationId: org.id,
    organization: org,
    apiKeyId: key.id,
    scopes: key.scopes ?? null,
  };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Resolve the caller: API key first (throws if present-but-invalid, same as
 * resolveAuth), then the BetterAuth session cookie. Use this on resource
 * routes that browsers hit directly — the session grants the logged-in user
 * access to resources owned by any org they belong to.
 */
export async function resolveViewer(request: Request): Promise<Viewer> {
  const auth = await resolveAuth(request);
  if (auth) return { auth, session: null };

  const session = await betterAuth.api.getSession({
    headers: request.headers,
  });
  if (!session) return { auth: null, session: null };

  const memberships = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, session.user.id));

  return {
    auth: null,
    session: {
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      organizationIds: memberships.map((m) => m.organizationId),
    },
  };
}

/**
 * The set of organization IDs the viewer may list resources from.
 * `null` means anonymous — anonymous callers may not list anything (public
 * resources stay reachable by ID, but are never enumerable).
 */
export function viewerOrganizationIds(viewer: Viewer): string[] | null {
  if (viewer.auth) return [viewer.auth.organizationId];
  if (viewer.session) return viewer.session.organizationIds;
  return null;
}

/**
 * Per-resource access check: public rows (organizationId null) are open to
 * anyone with the ID; owned rows require a matching API key or a session
 * belonging to a member of the owning org.
 */
export function viewerCanAccess(
  resourceOrganizationId: string | null,
  viewer: Viewer
): boolean {
  if (resourceOrganizationId === null) return true;
  if (viewer.auth) return viewer.auth.organizationId === resourceOrganizationId;
  if (viewer.session)
    return viewer.session.organizationIds.includes(resourceOrganizationId);
  return false;
}

/** The logged-in human for HTML chrome, or null. */
export function viewerUser(
  viewer: Viewer
): { name: string; email: string } | null {
  if (!viewer.session) return null;
  return { name: viewer.session.name, email: viewer.session.email };
}
