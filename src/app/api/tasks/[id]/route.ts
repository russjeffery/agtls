import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { task } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  type Viewer,
} from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeTask } from "@/lib/api/serialize";
import { taskPatchSchema as patchSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Check whether the caller is allowed to access this task.
 * - Row doesn't exist: returns { row: null, allowed: false }
 * - Row is public (organizationId=null): anyone can access
 * - Row has organizationId: caller needs a matching API key or a session
 *   belonging to a member of the owning org
 */
function checkOwnership(
  row: typeof task.$inferSelect | undefined,
  viewer: Viewer
): { row: typeof task.$inferSelect; allowed: boolean } | { row: null; allowed: false } {
  if (!row) return { row: null, allowed: false };
  return { row, allowed: viewerCanAccess(row.organizationId, viewer) };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const { id } = await params;

  const [row] = await db
    .select()
    .from(task)
    .where(eq(task.id, id))
    .limit(1);

  const { row: found, allowed } = checkOwnership(row, viewer);
  if (!found) return errorResponse(errors.notFound("task", id), 404);
  if (!allowed) return errorResponse(errors.forbidden(), 403);

  return ok(serializeTask(found));
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const { id } = await params;

  const [row] = await db
    .select()
    .from(task)
    .where(eq(task.id, id))
    .limit(1);

  const { row: found, allowed } = checkOwnership(row, viewer);
  if (!found) return errorResponse(errors.notFound("task", id), 404);
  if (!allowed) return errorResponse(errors.forbidden(), 403);

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  const updates: Partial<typeof task.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.due_at !== undefined) {
    updates.dueAt = body.due_at != null ? new Date(body.due_at * 1000) : null;
  }
  if (body.labels !== undefined) updates.labels = body.labels;

  const [updated] = await db
    .update(task)
    .set(updates)
    .where(eq(task.id, id))
    .returning();

  return ok(serializeTask(updated));
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const { id } = await params;

  const [row] = await db
    .select()
    .from(task)
    .where(eq(task.id, id))
    .limit(1);

  const { row: found, allowed } = checkOwnership(row, viewer);
  if (!found) return errorResponse(errors.notFound("task", id), 404);
  if (!allowed) return errorResponse(errors.forbidden(), 403);

  await db.delete(task).where(eq(task.id, id));

  return noContent();
}
