import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { task } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeTask } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
});

/**
 * Check whether the caller is allowed to access this task.
 * - Row doesn't exist: returns { row: null, allowed: false }
 * - Row is public (projectId=null): anyone can access
 * - Row has projectId: caller must be authenticated with matching projectId
 */
function checkOwnership(
  row: typeof task.$inferSelect | undefined,
  authProjectId: string | null | undefined
): { row: typeof task.$inferSelect; allowed: boolean } | { row: null; allowed: false } {
  if (!row) return { row: null, allowed: false };
  if (row.projectId === null) return { row, allowed: true };
  if (row.projectId === authProjectId) return { row, allowed: true };
  return { row, allowed: false };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  let auth;
  try {
    auth = await resolveAuth(request);
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

  const { row: found, allowed } = checkOwnership(row, auth?.projectId);
  if (!found) return errorResponse(errors.notFound("task", id), 404);
  if (!allowed) return errorResponse(errors.forbidden(), 403);

  const serialized = serializeTask(found);

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: found.id,
        objectType: "task",
        breadcrumb: [
          { label: "API", href: "/" },
          { label: "tasks", href: "/api/tasks" },
          { label: found.id },
        ],
        resource: serialized,
        apiRef: [
          {
            method: "GET",
            path: `/api/tasks/${found.id}`,
            description: "Get this task.",
          },
          {
            method: "PATCH",
            path: `/api/tasks/${found.id}`,
            description: "Update name or description.",
          },
          {
            method: "DELETE",
            path: `/api/tasks/${found.id}`,
            description: "Delete this task permanently.",
          },
          {
            method: "GET",
            path: `/api/tasks/${found.id}/subtasks`,
            description: "List subtasks in this task.",
          },
        ],
      },
      request
    );
  }

  return ok(serialized);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  let auth;
  try {
    auth = await resolveAuth(request);
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

  const { row: found, allowed } = checkOwnership(row, auth?.projectId);
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

  const [updated] = await db
    .update(task)
    .set(updates)
    .where(eq(task.id, id))
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/tasks/${updated.id}`, request.url).toString(),
      303
    );
  }

  return ok(serializeTask(updated));
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  let auth;
  try {
    auth = await resolveAuth(request);
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

  const { row: found, allowed } = checkOwnership(row, auth?.projectId);
  if (!found) return errorResponse(errors.notFound("task", id), 404);
  if (!allowed) return errorResponse(errors.forbidden(), 403);

  await db.delete(task).where(eq(task.id, id));

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/tasks`, request.url).toString(),
      303
    );
  }

  return noContent();
}
