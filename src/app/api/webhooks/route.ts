import { NextRequest } from "next/server";
import { eq, desc, lt, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { webhookEndpoint } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { ok, created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeWebhookEndpoint } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  max_events: z.number().int().min(1).max(10000).optional().nullable(),
});

export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await resolveAuth(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const after = searchParams.get("after");

  const ownershipCondition = auth
    ? eq(webhookEndpoint.projectId, auth.projectId)
    : isNull(webhookEndpoint.projectId);

  let cursorCondition;
  if (after) {
    const cursor = await db
      .select({ createdAt: webhookEndpoint.createdAt })
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.id, after))
      .limit(1);
    if (cursor.length > 0) {
      cursorCondition = lt(webhookEndpoint.createdAt, cursor[0].createdAt);
    }
  }

  const conditions = cursorCondition
    ? and(ownershipCondition, cursorCondition)
    : ownershipCondition;

  const rows = await db
    .select()
    .from(webhookEndpoint)
    .where(conditions)
    .orderBy(desc(webhookEndpoint.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((r) => serializeWebhookEndpoint(r));
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: "Webhooks",
        breadcrumb: [
          { label: "API", href: "/" },
          { label: "webhooks", href: "/api/webhooks" },
        ],
        description:
          "Webhook endpoints you can POST to. Each endpoint captures all inbound requests.",
        list: {
          items: data as Record<string, unknown>[],
          columns: [
            { key: "id", label: "ID", mono: true },
            { key: "name", label: "Name" },
            { key: "max_events", label: "Max Events" },
            { key: "created_at", label: "Created" },
          ],
          itemHref: (item) => `/api/webhooks/${(item as { id: string }).id}`,
          hasMore,
          nextCursor,
        },
        apiRef: [
          {
            method: "GET",
            path: "/api/webhooks",
            description: "List webhook endpoints.",
          },
          {
            method: "POST",
            path: "/api/webhooks",
            description:
              "Create a webhook endpoint. Returns a catch URL to send webhooks to.",
          },
        ],
      },
      request
    );
  }

  return listResponse(data, hasMore, nextCursor);
}

export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await resolveAuth(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  const id = newId("webhookEndpoint");
  const now = new Date();

  const [row] = await db
    .insert(webhookEndpoint)
    .values({
      id,
      projectId: auth ? auth.projectId : null,
      name: body.name,
      description: body.description ?? null,
      maxEvents: body.max_events ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/webhooks/${row.id}`, request.url).toString(),
      303
    );
  }

  return created(serializeWebhookEndpoint(row));
}
