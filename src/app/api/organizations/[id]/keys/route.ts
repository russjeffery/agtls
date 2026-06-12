import { NextRequest } from "next/server";
import { eq, and, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { db, apiKey } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";
import { getMembership } from "@/lib/orgs/service";
import { newApiKey, newId } from "@/lib/api/ids";
import { hashApiKey } from "@/lib/api/middleware";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeApiKey } from "@/lib/api/serialize";
import { headers } from "next/headers";

// Any member may list keys; minting requires owner or admin. Non-members get
// a 404 rather than 403 to avoid leaking org existence.
async function requireMember(orgId: string, roles?: string[]) {
  const session = await betterAuth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  const membership = await getMembership(orgId, session.user.id);
  if (!membership) throw new Error("NotFound");
  if (roles && !roles.includes(membership.role)) throw new Error("NotFound");
  return { session, membership };
}

function accessError(e: unknown, id: string) {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "NotFound")
    return errorResponse(errors.notFound("organization", id), 404);
  return errorResponse(errors.unauthorized(), 401);
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    await requireMember(id);
  } catch (e: unknown) {
    return accessError(e, id);
  }

  const rows = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.organizationId, id), isNull(apiKey.revokedAt)))
    .orderBy(desc(apiKey.createdAt));

  const data = rows.map(serializeApiKey);

  return listResponse(data, false, null, data.length);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    await requireMember(id, ["owner", "admin"]);
  } catch (e: unknown) {
    return accessError(e, id);
  }

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  const rawKey = newApiKey();
  const keyPrefix = rawKey.slice(0, 20);
  const keyHash = hashApiKey(rawKey);
  const keyId = newId("apiKey");

  await db.insert(apiKey).values({
    id: keyId,
    organizationId: id,
    name: body.name,
    keyPrefix,
    keyHash,
    createdAt: new Date(),
  });

  const responseData = {
    id: keyId,
    object: "api_key" as const,
    organization_id: id,
    name: body.name,
    key: rawKey,
    scopes: null,
    expires_at: null,
    created_by_agent: false,
    last_used_at: null,
    revoked_at: null,
    created_at: Math.floor(Date.now() / 1000),
  };

  return created(responseData);
}
