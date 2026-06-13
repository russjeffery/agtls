import { NextRequest } from "next/server";
import { eq, desc, and, inArray } from "drizzle-orm";
import { beforeCursor } from "@/lib/api/cursor";
import { db } from "@/lib/db";
import { artifact } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerOrganizationIds,
  viewerCreationOrganizationId,
} from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeArtifact } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
import { artifactCreateSchema as createSchema } from "@/lib/api/schemas";

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
  // null) get an empty list — public artifacts stay reachable by ID but are
  // never enumerable.
  const scope = viewerOrganizationIds(viewer);

  let rows: (typeof artifact.$inferSelect)[] = [];
  if (scope !== null && scope.length > 0) {
    const ownershipCondition = inArray(artifact.organizationId, scope);

    let cursorCondition;
    if (after) {
      const cursor = await db
        .select({ createdAt: artifact.createdAt })
        .from(artifact)
        .where(eq(artifact.id, after))
        .limit(1);
      if (cursor.length > 0) {
        cursorCondition = beforeCursor(
          artifact.createdAt,
          artifact.id,
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
      .from(artifact)
      .where(conditions)
      .orderBy(desc(artifact.createdAt), desc(artifact.id))
      .limit(limit + 1);
  }

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((r) => serializeArtifact(r));
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

  const id = newId("artifact");
  const now = new Date();

  // A signed-in caller (API key or browser session) owns what they create.
  // Only truly anonymous callers create a public resource, guarded by a claim
  // token so it can later be attached to an org via POST /api/claim/{id}.
  const ownerOrgId = viewerCreationOrganizationId(viewer);
  const claim = ownerOrgId ? null : mintResourceClaimToken();

  const [row] = await db
    .insert(artifact)
    .values({
      id,
      organizationId: ownerOrgId,
      name: body.name,
      content: body.content,
      format: body.format ?? "markdown",
      claimTokenHash: claim?.hash ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created(
    claim
      ? {
          ...serializeArtifact(row),
          claim_token: claim.token,
          claim_url: `/api/claim/${row.id}`,
        }
      : serializeArtifact(row)
  );
}
