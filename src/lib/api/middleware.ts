import { createHash } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db, apiKey, project } from "@/lib/db";

export interface AuthContext {
  projectId: string;
  project: typeof project.$inferSelect;
  apiKeyId: string;
  environment: "live" | "test";
  // Scope set for agent-auth credentials. `null` means an unscoped legacy key
  // (full access). Scope enforcement on resource routes is not wired up yet —
  // this surfaces the scopes so callers can introspect them.
  scopes: string[] | null;
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
      proj: project,
    })
    .from(apiKey)
    .innerJoin(project, eq(apiKey.projectId, project.id))
    .where(and(eq(apiKey.keyHash, keyHash), isNull(apiKey.revokedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("The API key provided is invalid or has been revoked.");
  }

  const { key, proj } = rows[0];

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
    projectId: proj.id,
    project: proj,
    apiKeyId: key.id,
    environment: key.environment,
    scopes: key.scopes ?? null,
  };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
