import { NextRequest } from "next/server";
import { eq, desc, lt, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEndpoint } from "@/lib/db/schema";
import {
  resolveAuth,
  resolveViewer,
  viewerOrganizationIds,
} from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeWebhookEndpoint } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
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
