import { NextRequest } from "next/server";
import { eq, desc, lt, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduledMessage } from "@/lib/db/schema";
import {
  resolveAuth,
  resolveViewer,
  viewerOrganizationIds,
  viewerUser,
} from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeScheduledMessage } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";
import { messageCreateSchema as createSchema } from "@/lib/api/schemas";

// Only http(s) targets are deliverable. Reject other schemes up front so a
// scheduled message can never be used to reach internal protocols.
function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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
  // null) get an empty list — public messages stay reachable by ID but are
  // never enumerable.
  const scope = viewerOrganizationIds(viewer);

  let rows: (typeof scheduledMessage.$inferSelect)[] = [];
  if (scope !== null && scope.length > 0) {
    const ownershipCondition = inArray(scheduledMessage.organizationId, scope);

    let cursorCondition;
    if (after) {
      const cursor = await db
        .select({ createdAt: scheduledMessage.createdAt })
        .from(scheduledMessage)
        .where(eq(scheduledMessage.id, after))
        .limit(1);
      if (cursor.length > 0) {
        cursorCondition = lt(scheduledMessage.createdAt, cursor[0].createdAt);
      }
    }

    const conditions = cursorCondition
      ? and(ownershipCondition, cursorCondition)
      : ownershipCondition;

    rows = await db
      .select()
      .from(scheduledMessage)
      .where(conditions)
      .orderBy(desc(scheduledMessage.createdAt))
      .limit(limit + 1);
  }

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((r) => serializeScheduledMessage(r));
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  if (wantsHtml(request)) {
    const signedOut = scope === null;
    return htmlResponse(
      {
        title: "Messages",
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "messages", href: "/api/messages" },
        ],
        description:
          "Scheduled messages — fire an HTTP request to a URL at a later time to trigger an agent.",
        user: viewerUser(viewer),
        notice: signedOut
          ? {
              title: "Sign in to see your messages",
              message:
                "Scheduled messages are scoped to your account. Sign in to list the messages in your organizations — or pass an API key when calling this endpoint.",
              actions: [
                { label: "Sign in", href: "/sign-in", primary: true },
                { label: "Create an account", href: "/sign-up" },
              ],
            }
          : undefined,
        createForm: signedOut
          ? undefined
          : {
              title: "Schedule a message",
              endpoint: "/api/messages",
              submitLabel: "Schedule",
              fields: [
                {
                  name: "url",
                  label: "Target URL",
                  placeholder: "https://example.com/agent/wake",
                  required: true,
                },
                {
                  name: "method",
                  label: "HTTP method",
                  placeholder: "POST",
                },
                {
                  name: "body",
                  label: "Request body",
                  type: "textarea",
                  placeholder: "{ \"event\": \"wake\" }",
                },
                {
                  name: "delay_seconds",
                  label: "Delay (seconds from now)",
                  type: "number",
                  placeholder: "4500",
                  required: true,
                },
              ],
            },
        list: signedOut
          ? undefined
          : {
              items: data as Record<string, unknown>[],
              columns: [
                { key: "id", label: "ID", mono: true },
                { key: "url", label: "Target" },
                {
                  key: "status",
                  label: "Status",
                  badge: {
                    scheduled: "#60a5fa",
                    delivering: "#fbbf24",
                    delivered: "#34d399",
                    failed: "#f87171",
                    canceled: "#a1a1aa",
                  },
                },
                { key: "scheduled_at", label: "Scheduled" },
              ],
              itemHref: (item) => `/api/messages/${(item as { id: string }).id}`,
              actions: {
                deleteConfirm: (item) =>
                  `Cancel and delete message ${(item as { id: string }).id}? If it hasn't fired yet, it never will.`,
              },
              hasMore,
              nextCursor,
            },
        apiRef: [
          {
            method: "GET",
            path: "/api/messages",
            description: "List scheduled messages.",
          },
          {
            method: "POST",
            path: "/api/messages",
            description:
              "Schedule a message. Provide scheduled_at or delay_seconds.",
          },
          {
            method: "POST",
            path: "/api/messages/dispatch",
            description: "Deliver all due messages (called by a cron).",
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

  if (!isHttpUrl(body.url)) {
    return errorResponse(
      errors.invalidParam("url", "url must be an http or https URL."),
      400
    );
  }

  const now = new Date();
  const scheduledAt =
    body.scheduled_at !== undefined
      ? new Date(body.scheduled_at * 1000)
      : new Date(now.getTime() + (body.delay_seconds ?? 0) * 1000);

  const id = newId("scheduledMessage");

  // Public creation gets a claim token so the resource can later be attached
  // to an organization via POST /api/claim/{id}. Returned in plaintext exactly once.
  const claim = auth ? null : mintResourceClaimToken();

  const [row] = await db
    .insert(scheduledMessage)
    .values({
      id,
      organizationId: auth ? auth.organizationId : null,
      channel: body.channel ?? "http",
      url: body.url,
      method: body.method ?? "POST",
      headers: body.headers ?? null,
      body: body.body ?? null,
      scheduledAt,
      status: "scheduled",
      claimTokenHash: claim?.hash ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/messages/${row.id}`, request.url).toString(),
      303
    );
  }

  return created(
    claim
      ? {
          ...serializeScheduledMessage(row),
          claim_token: claim.token,
          claim_url: `/api/claim/${row.id}`,
        }
      : serializeScheduledMessage(row)
  );
}
