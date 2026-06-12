import { NextRequest } from "next/server";
import { eq, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEndpoint, webhookEvent } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  type Viewer,
} from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeWebhookEndpoint } from "@/lib/api/serialize";
import { webhookPatchSchema as updateSchema } from "@/lib/api/schemas";

type Params = { params: Promise<{ id: string }> };

async function getEndpointOrError(id: string) {
  const rows = await db
    .select()
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.id, id))
    .limit(1);
  return rows[0] ?? null;
}

function checkOwnership(
  endpoint: typeof webhookEndpoint.$inferSelect,
  viewer: Viewer
): boolean {
  return viewerCanAccess(endpoint.organizationId, viewer);
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const endpoint = await getEndpointOrError(id);
  if (!endpoint) {
    return errorResponse(errors.notFound("webhook endpoint", id), 404);
  }

  if (!checkOwnership(endpoint, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  // Include event count
  const [{ value: eventCount }] = await db
    .select({ value: count() })
    .from(webhookEvent)
    .where(eq(webhookEvent.endpointId, id));

  return ok(serializeWebhookEndpoint(endpoint, eventCount));
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const endpoint = await getEndpointOrError(id);
  if (!endpoint) {
    return errorResponse(errors.notFound("webhook endpoint", id), 404);
  }

  if (!checkOwnership(endpoint, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  let body;
  try {
    body = updateSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  const updates: Partial<typeof webhookEndpoint.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if ("description" in body) updates.description = body.description ?? null;
  if ("max_events" in body) updates.maxEvents = body.max_events ?? null;

  const [updated] = await db
    .update(webhookEndpoint)
    .set(updates)
    .where(eq(webhookEndpoint.id, id))
    .returning();

  return ok(serializeWebhookEndpoint(updated));
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const endpoint = await getEndpointOrError(id);
  if (!endpoint) {
    return errorResponse(errors.notFound("webhook endpoint", id), 404);
  }

  if (!checkOwnership(endpoint, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  // Cascade delete events via FK, then delete endpoint
  await db.delete(webhookEvent).where(eq(webhookEvent.endpointId, id));
  await db.delete(webhookEndpoint).where(eq(webhookEndpoint.id, id));

  return noContent();
}
