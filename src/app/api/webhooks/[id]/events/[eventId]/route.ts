import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEndpoint, webhookEvent } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  type Viewer,
} from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeWebhookEvent } from "@/lib/api/serialize";

type Params = { params: Promise<{ id: string; eventId: string }> };

async function getEndpointOrNull(id: string) {
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
  const { id, eventId } = await params;

  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const endpoint = await getEndpointOrNull(id);
  if (!endpoint) {
    return errorResponse(errors.notFound("webhook endpoint", id), 404);
  }

  if (!checkOwnership(endpoint, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  const rows = await db
    .select()
    .from(webhookEvent)
    .where(and(eq(webhookEvent.id, eventId), eq(webhookEvent.endpointId, id)))
    .limit(1);

  if (rows.length === 0) {
    return errorResponse(errors.notFound("webhook event", eventId), 404);
  }

  return ok(serializeWebhookEvent(rows[0]));
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id, eventId } = await params;

  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const endpoint = await getEndpointOrNull(id);
  if (!endpoint) {
    return errorResponse(errors.notFound("webhook endpoint", id), 404);
  }

  if (!checkOwnership(endpoint, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  const rows = await db
    .select({ id: webhookEvent.id })
    .from(webhookEvent)
    .where(and(eq(webhookEvent.id, eventId), eq(webhookEvent.endpointId, id)))
    .limit(1);

  if (rows.length === 0) {
    return errorResponse(errors.notFound("webhook event", eventId), 404);
  }

  await db.delete(webhookEvent).where(eq(webhookEvent.id, eventId));

  return noContent();
}
