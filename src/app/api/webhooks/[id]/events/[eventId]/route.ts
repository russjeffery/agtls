import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEndpoint, webhookEvent } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeWebhookEvent } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";

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
  auth: { projectId: string } | null
): boolean {
  if (endpoint.projectId === null) return true;
  if (!auth) return false;
  return auth.projectId === endpoint.projectId;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id, eventId } = await params;

  let auth;
  try {
    auth = await resolveAuth(request);
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

  if (!checkOwnership(endpoint, auth)) {
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

  const serialized = serializeWebhookEvent(rows[0]);

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: eventId,
        objectType: "webhook_event",
        breadcrumb: [
          { label: "API", href: "/" },
          { label: "webhooks", href: "/api/webhooks" },
          { label: id, href: `/api/webhooks/${id}` },
          { label: "events", href: `/api/webhooks/${id}/events` },
          { label: eventId },
        ],
        resource: serialized,
        apiRef: [
          {
            method: "GET",
            path: `/api/webhooks/${id}/events/${eventId}`,
            description: "Get this event.",
          },
          {
            method: "DELETE",
            path: `/api/webhooks/${id}/events/${eventId}`,
            description: "Delete this event.",
          },
        ],
      },
      request
    );
  }

  return ok(serialized);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id, eventId } = await params;

  let auth;
  try {
    auth = await resolveAuth(request);
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

  if (!checkOwnership(endpoint, auth)) {
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

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/webhooks/${id}/events`, request.url).toString(),
      303
    );
  }

  return noContent();
}
