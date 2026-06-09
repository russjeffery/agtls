import { NextRequest } from "next/server";
import { eq, and, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { db, project, apiKey } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";
import { newApiKey, newId } from "@/lib/api/ids";
import { hashApiKey } from "@/lib/api/middleware";
import { ok, created, errorResponse, listResponse } from "@/lib/api/response";
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

const createSchema = z.object({
  name: z.string().min(1).max(100),
  environment: z.enum(["live", "test"]).default("live"),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    await requireProjectOwner(id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NotFound") return errorResponse(errors.notFound("project", id), 404);
    return errorResponse(errors.unauthorized(), 401);
  }

  const rows = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.projectId, id), isNull(apiKey.revokedAt)))
    .orderBy(desc(apiKey.createdAt));

  return listResponse(rows.map(serializeApiKey), false, null, rows.length);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    await requireProjectOwner(id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NotFound") return errorResponse(errors.notFound("project", id), 404);
    return errorResponse(errors.unauthorized(), 401);
  }

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  const rawKey = newApiKey(body.environment);
  const keyPrefix = rawKey.slice(0, 20); // "agt_live_xxxxxxxxxxx"
  const keyHash = hashApiKey(rawKey);
  const keyId = newId("apiKey");

  await db.insert(apiKey).values({
    id: keyId,
    projectId: id,
    name: body.name,
    keyPrefix,
    keyHash,
    environment: body.environment,
    createdAt: new Date(),
  });

  // Return the full key ONCE — it will never be shown again
  return created({
    id: keyId,
    object: "api_key" as const,
    project_id: id,
    name: body.name,
    key: rawKey, // shown only on creation
    environment: body.environment,
    last_used_at: null,
    revoked_at: null,
    created_at: Math.floor(Date.now() / 1000),
  });
}
