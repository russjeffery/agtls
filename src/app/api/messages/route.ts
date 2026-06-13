import { NextRequest } from "next/server";
import { eq, desc, and, inArray } from "drizzle-orm";
import { beforeCursor } from "@/lib/api/cursor";
import { db } from "@/lib/db";
import { scheduledMessage } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerOrganizationIds,
  viewerCreationOrganizationId,
} from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeScheduledMessage } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
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
        cursorCondition = beforeCursor(
          scheduledMessage.createdAt,
          scheduledMessage.id,
          cursor[0].createdAt,
          after
        );
      }
    }

    const conditions = cursorCondition
      ? and(ownershipCondition, cursorCondition)
      : ownershipCondition;

    rows = await db
      .select()
      .from(scheduledMessage)
      .where(conditions)
      .orderBy(desc(scheduledMessage.createdAt), desc(scheduledMessage.id))
      .limit(limit + 1);
  }

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((r) => serializeScheduledMessage(r));
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return listResponse(data, hasMore, nextCursor);
}

export async function POST(request: NextRequest) {
  let viewer;
  try {
    viewer = await resolveViewer(request);
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

  // A signed-in caller (API key or browser session) owns what they create.
  // Only truly anonymous callers create a public resource, guarded by a claim
  // token so it can later be attached to an org via POST /api/claim/{id}.
  const ownerOrgId = viewerCreationOrganizationId(viewer);
  const claim = ownerOrgId ? null : mintResourceClaimToken();

  const [row] = await db
    .insert(scheduledMessage)
    .values({
      id,
      organizationId: ownerOrgId,
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
