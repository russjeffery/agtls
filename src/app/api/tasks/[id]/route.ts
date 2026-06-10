import { NextRequest } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { task, subtask } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  viewerUser,
  type Viewer,
} from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeTask, serializeSubtask } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse, errorHtmlResponse } from "@/lib/api/html";
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
  if (!found) {
    if (wantsHtml(request)) {
      return errorHtmlResponse(
        {
          status: 404,
          title: "Task not found",
          message: `No task with ID '${id}' exists. It may have been deleted.`,
          user: viewerUser(viewer),
        },
        request
      );
    }
    return errorResponse(errors.notFound("task", id), 404);
  }
  if (!allowed) {
    if (wantsHtml(request)) {
      return errorHtmlResponse(
        {
          status: 403,
          title: "You don't have access to this task",
          message:
            "This task belongs to another organization. Sign in with an account that's a member of the owning organization, or use its API key.",
          user: viewerUser(viewer),
        },
        request
      );
    }
    return errorResponse(errors.forbidden(), 403);
  }

  const serialized = serializeTask(found);

  if (wantsHtml(request)) {
    const subtaskRows = await db
      .select()
      .from(subtask)
      .where(eq(subtask.taskId, found.id))
      .orderBy(desc(subtask.createdAt))
      .limit(5);

    return htmlResponse(
      {
        title: found.id,
        objectType: "task",
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "tasks", href: "/api/tasks" },
          { label: found.id },
        ],
        user: viewerUser(viewer),
        resource: serialized,
        childList: {
          title: "Subtasks",
          items: subtaskRows.map(serializeSubtask) as Record<string, unknown>[],
          columns: [
            { key: "id", label: "ID", mono: true },
            { key: "title", label: "Title" },
            {
              key: "status",
              label: "Status",
              badge: {
                todo: "#a1a1aa",
                in_progress: "#60a5fa",
                done: "#34d399",
                cancelled: "#71717a",
              },
            },
            {
              key: "priority",
              label: "Priority",
              badge: {
                low: "#71717a",
                medium: "#fbbf24",
                high: "#fb923c",
                urgent: "#f87171",
              },
            },
          ],
          itemHref: (item) => `/api/subtasks/${(item as { id: string }).id}`,
          viewAllHref: `/api/tasks/${found.id}/subtasks`,
          emptyMessage: "No subtasks yet.",
        },
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

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/tasks`, request.url).toString(),
      303
    );
  }

  return noContent();
}
