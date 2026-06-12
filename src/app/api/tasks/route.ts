import { NextRequest } from "next/server";
import { eq, and, inArray, desc, lt, arrayContains } from "drizzle-orm";
import { db } from "@/lib/db";
import { task } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerOrganizationIds,
  viewerCreationOrganizationId,
} from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeTask } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
import { taskCreateSchema as createSchema } from "@/lib/api/schemas";

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
  const rawLimit = parseInt(searchParams.get("limit") ?? "20");
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 20 : rawLimit), 100);
  const after = searchParams.get("after");
  // ?label= may repeat; a task must carry every requested label to match.
  const labels = searchParams.getAll("label").filter((l) => l.length > 0);

  // Lists are scoped to the caller's organizations. Anonymous callers (scope null)
  // get an empty list — public resources stay reachable by ID but are never
  // enumerable.
  const scope = viewerOrganizationIds(viewer);

  let rows: (typeof task.$inferSelect)[] = [];
  if (scope !== null && scope.length > 0) {
    const conditions = [inArray(task.organizationId, scope)];

    if (labels.length > 0) {
      conditions.push(arrayContains(task.labels, labels));
    }

    // Cursor: resolve createdAt of the "after" row to do time-based pagination
    if (after) {
      const [cursorRow] = await db
        .select({ createdAt: task.createdAt })
        .from(task)
        .where(eq(task.id, after))
        .limit(1);

      if (cursorRow) {
        conditions.push(lt(task.createdAt, cursorRow.createdAt));
      }
    }

    rows = await db
      .select()
      .from(task)
      .where(and(...conditions))
      .orderBy(desc(task.createdAt))
      .limit(limit + 1);
  }

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serializeTask);
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

  const id = newId("task");
  const now = new Date();

  // A signed-in caller (API key or browser session) owns what they create.
  // Only truly anonymous callers create a public resource, guarded by a claim
  // token so it can later be attached to an org via POST /api/claim/{id}.
  const ownerOrgId = viewerCreationOrganizationId(viewer);
  const claim = ownerOrgId ? null : mintResourceClaimToken();

  const [row] = await db
    .insert(task)
    .values({
      id,
      organizationId: ownerOrgId,
      name: body.name,
      description: body.description ?? null,
      priority: body.priority ?? "low",
      dueAt: body.due_at != null ? new Date(body.due_at * 1000) : null,
      labels: body.labels ?? null,
      claimTokenHash: claim?.hash ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created(
    claim
      ? {
          ...serializeTask(row),
          claim_token: claim.token,
          claim_url: `/api/claim/${row.id}`,
        }
      : serializeTask(row)
  );
}
