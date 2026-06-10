import { NextRequest } from "next/server";
import { eq, desc, lt, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEndpoint } from "@/lib/db/schema";
import {
  resolveAuth,
  resolveViewer,
  viewerOrganizationIds,
  viewerUser,
} from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeWebhookEndpoint } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";
import { webhookCreateSchema as createSchema } from "@/lib/api/schemas";

export async function GET(request: NextRequest) {
  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const after = searchParams.get("after");

  // Lists are scoped to the caller's organizations. Anonymous callers (scope
  // null) get an empty list — public endpoints stay reachable by ID but are
  // never enumerable.
  const scope = viewerOrganizationIds(viewer);

  let rows: (typeof webhookEndpoint.$inferSelect)[] = [];
  if (scope !== null && scope.length > 0) {
    const ownershipCondition = inArray(webhookEndpoint.organizationId, scope);

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

    rows = await db
      .select()
      .from(webhookEndpoint)
      .where(conditions)
      .orderBy(desc(webhookEndpoint.createdAt))
      .limit(limit + 1);
  }

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((r) => serializeWebhookEndpoint(r));
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  if (wantsHtml(request)) {
    const signedOut = scope === null;
    return htmlResponse(
      {
        title: "Webhooks",
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "webhooks", href: "/api/webhooks" },
        ],
        description:
          "Webhook endpoints you can POST to. Each endpoint captures all inbound requests.",
        user: viewerUser(viewer),
        notice: signedOut
          ? {
              title: "Sign in to see your webhooks",
              message:
                "Webhook endpoints are scoped to your account. Sign in to list the endpoints in your organizations — or pass an API key when calling this endpoint.",
              actions: [
                { label: "Sign in", href: "/sign-in", primary: true },
                { label: "Create an account", href: "/sign-up" },
              ],
            }
          : undefined,
        createForm: signedOut
          ? undefined
          : {
              title: "New webhook endpoint",
              endpoint: "/api/webhooks",
              submitLabel: "Create endpoint",
              fields: [
                {
                  name: "name",
                  label: "Name",
                  placeholder: "Stripe events",
                  required: true,
                },
                {
                  name: "description",
                  label: "Description",
                  type: "textarea",
                  placeholder: "What this endpoint captures…",
                },
                {
                  name: "max_events",
                  label: "Max events",
                  type: "number",
                  placeholder: "Defaults to unlimited",
                },
              ],
            },
        list: signedOut
          ? undefined
          : {
          items: data as Record<string, unknown>[],
          columns: [
            { key: "id", label: "ID", mono: true },
            { key: "name", label: "Name" },
            { key: "max_events", label: "Max Events" },
            { key: "created_at", label: "Created" },
          ],
          itemHref: (item) => `/api/webhooks/${(item as { id: string }).id}`,
          actions: {
            deleteConfirm: (item) =>
              `Delete webhook endpoint ${(item as { id: string }).id}? This permanently deletes all data for this endpoint, including every captured event.`,
          },
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

  // Public creation gets a claim token so the resource can later be attached
  // to an organization via POST /api/claim/{id}. Returned in plaintext exactly once.
  const claim = auth ? null : mintResourceClaimToken();

  const [row] = await db
    .insert(webhookEndpoint)
    .values({
      id,
      organizationId: auth ? auth.organizationId : null,
      name: body.name,
      description: body.description ?? null,
      maxEvents: body.max_events ?? null,
      claimTokenHash: claim?.hash ?? null,
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

  return created(
    claim
      ? {
          ...serializeWebhookEndpoint(row),
          claim_token: claim.token,
          claim_url: `/api/claim/${row.id}`,
        }
      : serializeWebhookEndpoint(row)
  );
}
