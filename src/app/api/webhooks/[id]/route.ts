import { NextRequest } from "next/server";
import { eq, count } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { webhookEndpoint, webhookEvent } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeWebhookEndpoint } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";

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
  auth: { projectId: string } | null
): boolean {
  if (endpoint.projectId === null) return true; // public resource
  if (!auth) return false;
  return auth.projectId === endpoint.projectId;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let auth;
  try {
    auth = await resolveAuth(request);
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

  if (!checkOwnership(endpoint, auth)) {
    return errorResponse(errors.forbidden(), 403);
  }

  // Include event count
  const [{ value: eventCount }] = await db
    .select({ value: count() })
    .from(webhookEvent)
    .where(eq(webhookEvent.endpointId, id));

  const serialized = serializeWebhookEndpoint(endpoint, eventCount);

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: endpoint.id,
        objectType: "webhook_endpoint",
        breadcrumb: [
          { label: "API", href: "/" },
          { label: "webhooks", href: "/api/webhooks" },
          { label: endpoint.id },
        ],
        resource: serialized,
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

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  max_events: z.number().int().min(1).max(10000).optional().nullable(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let auth;
  try {
    auth = await resolveAuth(request);
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

  if (!checkOwnership(endpoint, auth)) {
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

  let auth;
  try {
    auth = await resolveAuth(request);
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

  if (!checkOwnership(endpoint, auth)) {
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
