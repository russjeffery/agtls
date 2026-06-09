import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, project, apiKey } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeApiKey } from "@/lib/api/serialize";
import { headers } from "next/headers";

async function requireProjectOwner(projectId: string) {
  const session = await betterAuth.api.getSession({
    headers: await headers(),
  });
  if (!session) throw new Error("Unauthorized");

  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session.user.id)))
    .limit(1);

  if (!proj) throw new Error("NotFound");
  return { session, proj };
}

type RouteContext = { params: Promise<{ id: string; keyId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id, keyId } = await params;

  try {
    await requireProjectOwner(id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NotFound") return errorResponse(errors.notFound("project", id), 404);
    return errorResponse(errors.unauthorized(), 401);
  }

  const [row] = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.id, keyId), eq(apiKey.projectId, id)))
    .limit(1);

  if (!row) return errorResponse(errors.notFound("api_key", keyId), 404);

  return ok(serializeApiKey(row));
}

// Revoke a key (soft delete)
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id, keyId } = await params;

  try {
    await requireProjectOwner(id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NotFound") return errorResponse(errors.notFound("project", id), 404);
    return errorResponse(errors.unauthorized(), 401);
  }

  const [row] = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.id, keyId), eq(apiKey.projectId, id)))
    .limit(1);

  if (!row) return errorResponse(errors.notFound("api_key", keyId), 404);

  const [revoked] = await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(eq(apiKey.id, keyId))
    .returning();

  return ok(serializeApiKey(revoked));
}
