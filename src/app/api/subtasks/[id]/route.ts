import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { subtask } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeSubtask } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  status: z
    .enum(["todo", "in_progress", "done", "cancelled"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignee: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  due_at: z.number().int().nullable().optional(),
  task_id: z.string().nullable().optional(),
});

function checkOwnership(
  row: typeof subtask.$inferSelect | undefined,
  authProjectId: string | null | undefined
): { row: typeof subtask.$inferSelect; allowed: boolean } | { row: null; allowed: false } {
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
    .from(subtask)
    .where(eq(subtask.id, id))
    .limit(1);

  const { row: found, allowed } = checkOwnership(row, auth?.projectId);
  if (!found) return errorResponse(errors.notFound("subtask", id), 404);
  if (!allowed) return errorResponse(errors.forbidden(), 403);

  const serialized = serializeSubtask(found);
  const taskId = found.taskId;

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: found.id,
        objectType: "subtask",
        breadcrumb: [
          { label: "API", href: "/" },
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
    .from(subtask)
    .where(eq(subtask.id, id))
    .limit(1);

  const { row: found, allowed } = checkOwnership(row, auth?.projectId);
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
    .from(subtask)
    .where(eq(subtask.id, id))
    .limit(1);

  const { row: found, allowed } = checkOwnership(row, auth?.projectId);
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
