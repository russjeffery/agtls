import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subtask } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  viewerUser,
  type Viewer,
} from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeSubtask } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse, errorHtmlResponse } from "@/lib/api/html";
import { subtaskPatchSchema as patchSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string }> };

function checkOwnership(
  row: typeof subtask.$inferSelect | undefined,
  viewer: Viewer
): { row: typeof subtask.$inferSelect; allowed: boolean } | { row: null; allowed: false } {
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
    .from(subtask)
    .where(eq(subtask.id, id))
    .limit(1);

  const { row: found, allowed } = checkOwnership(row, viewer);
  if (!found) {
    if (wantsHtml(request)) {
      return errorHtmlResponse(
        {
          status: 404,
          title: "Subtask not found",
          message: `No subtask with ID '${id}' exists. It may have been deleted.`,
          user: viewerUser(viewer),
        },
        request
      );
    }
    return errorResponse(errors.notFound("subtask", id), 404);
  }
  if (!allowed) {
    if (wantsHtml(request)) {
      return errorHtmlResponse(
        {
          status: 403,
          title: "You don't have access to this subtask",
          message:
            "This subtask belongs to another organization. Sign in with an account that's a member of the owning organization, or use its API key.",
          user: viewerUser(viewer),
        },
        request
      );
    }
    return errorResponse(errors.forbidden(), 403);
  }

  const serialized = serializeSubtask(found);
  const taskId = found.taskId;

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: found.id,
        objectType: "subtask",
        user: viewerUser(viewer),
        breadcrumb: [
          { label: "API", href: "/api" },
          taskId
            ? { label: taskId, href: `/api/tasks/${taskId}` }
            : { label: "subtasks", href: "/api/subtasks" },
          ...(taskId ? [{ label: "subtasks", href: `/api/tasks/${taskId}/subtasks` }] : []),
          { label: found.id },
        ],
        resource: serialized,
        apiRef: [
          {
            method: "GET",
            path: `/api/subtasks/${found.id}`,
            description: "Get this subtask.",
          },
          {
            method: "PATCH",
            path: `/api/subtasks/${found.id}`,
            description:
              "Update title, status, priority, assignee, description, metadata, due_at.",
          },
          {
            method: "DELETE",
            path: `/api/subtasks/${found.id}`,
            description: "Delete this subtask permanently.",
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
    .from(subtask)
    .where(eq(subtask.id, id))
    .limit(1);

  const { row: found, allowed } = checkOwnership(row, viewer);
  if (!found) return errorResponse(errors.notFound("subtask", id), 404);
  if (!allowed) return errorResponse(errors.forbidden(), 403);

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  const now = new Date();
  const updates: Partial<typeof subtask.$inferInsert> = { updatedAt: now };

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.assignee !== undefined) updates.assignee = body.assignee;
  if (body.metadata !== undefined) updates.metadata = body.metadata;
  if (body.task_id !== undefined) updates.taskId = body.task_id;

  if (body.due_at !== undefined) {
    updates.dueAt = body.due_at != null ? new Date(body.due_at * 1000) : null;
  }

  if (body.priority !== undefined) updates.priority = body.priority;

  if (body.status !== undefined) {
    updates.status = body.status;
    // Set completedAt when transitioning to done, clear when leaving
    if (body.status === "done" && found.status !== "done") {
      updates.completedAt = now;
    } else if (body.status !== "done" && found.status === "done") {
      updates.completedAt = null;
    }
  }

  const [updated] = await db
    .update(subtask)
    .set(updates)
    .where(eq(subtask.id, id))
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/subtasks/${updated.id}`, request.url).toString(),
      303
    );
  }

  return ok(serializeSubtask(updated));
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
    .from(subtask)
    .where(eq(subtask.id, id))
    .limit(1);

  const { row: found, allowed } = checkOwnership(row, viewer);
  if (!found) return errorResponse(errors.notFound("subtask", id), 404);
  if (!allowed) return errorResponse(errors.forbidden(), 403);

  await db.delete(subtask).where(eq(subtask.id, id));

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/subtasks`, request.url).toString(),
      303
    );
  }

  return noContent();
}
