import { NextRequest } from "next/server";
import { eq, desc, lt, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEndpoint, webhookEvent } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  type Viewer,
} from "@/lib/api/middleware";
import { noContent, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeWebhookEvent } from "@/lib/api/serialize";

type Params = { params: Promise<{ id: string }> };

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

  const endpoint = await getEndpointOrNull(id);
  if (!endpoint) {
    return errorResponse(errors.notFound("webhook endpoint", id), 404);
  }

  if (!checkOwnership(endpoint, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const after = searchParams.get("after");

  let cursorCondition;
  if (after) {
    const cursor = await db
      .select({ receivedAt: webhookEvent.receivedAt })
      .from(webhookEvent)
      .where(eq(webhookEvent.id, after))
      .limit(1);
    if (cursor.length > 0) {
      cursorCondition = lt(webhookEvent.receivedAt, cursor[0].receivedAt);
    }
  }

  const baseCondition = eq(webhookEvent.endpointId, id);
  const conditions = cursorCondition
    ? and(baseCondition, cursorCondition)
    : baseCondition;

  const rows = await db
    .select()
    .from(webhookEvent)
    .where(conditions)
    .orderBy(desc(webhookEvent.receivedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serializeWebhookEvent);
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return listResponse(data, hasMore, nextCursor);
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

  const endpoint = await getEndpointOrNull(id);
  if (!endpoint) {
    return errorResponse(errors.notFound("webhook endpoint", id), 404);
  }

  if (!checkOwnership(endpoint, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  await db.delete(webhookEvent).where(eq(webhookEvent.endpointId, id));

  return noContent();
}
