import { NextRequest } from "next/server";
import { eq, count, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEndpoint, webhookEvent } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  viewerUser,
  type Viewer,
} from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import {
  serializeWebhookEndpoint,
  serializeWebhookEvent,
} from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse, errorHtmlResponse } from "@/lib/api/html";
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
    if (wantsHtml(request)) {
      return errorHtmlResponse(
        {
          status: 404,
          title: "Webhook endpoint not found",
          message: `No webhook endpoint with ID '${id}' exists. It may have been deleted.`,
          user: viewerUser(viewer),
        },
        request
      );
    }
    return errorResponse(errors.notFound("webhook endpoint", id), 404);
  }

  if (!checkOwnership(endpoint, viewer)) {
    if (wantsHtml(request)) {
      return errorHtmlResponse(
        {
          status: 403,
          title: "You don't have access to this webhook endpoint",
          message:
            "This endpoint belongs to another organization. Sign in with an account that's a member of the owning organization, or use its API key.",
          user: viewerUser(viewer),
        },
        request
      );
    }
    return errorResponse(errors.forbidden(), 403);
  }

  // Include event count
  const [{ value: eventCount }] = await db
    .select({ value: count() })
    .from(webhookEvent)
    .where(eq(webhookEvent.endpointId, id));

  const serialized = serializeWebhookEndpoint(endpoint, eventCount);

  if (wantsHtml(request)) {
    const eventRows = await db
      .select()
      .from(webhookEvent)
      .where(eq(webhookEvent.endpointId, id))
      .orderBy(desc(webhookEvent.receivedAt))
      .limit(5);

    return htmlResponse(
      {
        title: endpoint.id,
        objectType: "webhook_endpoint",
        user: viewerUser(viewer),
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "webhooks", href: "/api/webhooks" },
          { label: endpoint.id },
        ],
        resource: serialized,
        childList: {
          title: "Recent events",
          items: eventRows.map(serializeWebhookEvent) as Record<
            string,
            unknown
          >[],
          columns: [
            { key: "id", label: "ID", mono: true },
            {
              key: "method",
              label: "Method",
              badge: {
                GET: "#34d399",
                POST: "#60a5fa",
                PUT: "#a78bfa",
                PATCH: "#fbbf24",
                DELETE: "#f87171",
              },
            },
            { key: "path", label: "Path", mono: true },
            { key: "size_bytes", label: "Size" },
            { key: "received_at", label: "Received" },
          ],
          itemHref: (item) =>
            `/api/webhooks/${id}/events/${(item as { id: string }).id}`,
          viewAllHref: `/api/webhooks/${id}/events`,
          emptyMessage: `No events captured yet. POST to /api/catch/${id} to capture one.`,
        },
        apiRef: [
          {
            method: "GET",
            path: `/api/webhooks/${id}`,
            description: "Get this endpoint.",
          },
          {
            method: "PATCH",
            path: `/api/webhooks/${id}`,
            description: "Update name, description, or max_events.",
          },
          {
            method: "DELETE",
            path: `/api/webhooks/${id}`,
            description: "Delete endpoint and all events.",
          },
          {
            method: "GET",
            path: `/api/webhooks/${id}/events`,
            description: "List captured events.",
          },
          {
            method: "POST",
            path: `/api/catch/${id}`,
            description:
              "Send a webhook (the catch URL — use this in your integrations).",
          },
        ],
      },
      request
    );
  }

  return ok(serialized);
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

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/webhooks/${id}`, request.url).toString(),
      303
    );
  }

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

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL("/api/webhooks", request.url).toString(),
      303
    );
  }

  return noContent();
}
