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
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  status: z
    .enum(["todo", "in_progress", "done", "cancelled"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignee: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  due_at: z.number().int().nullable().optional(),
  list_id: z.string().nullable().optional(),
});

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
            description:
              "Update title, status, priority, assignee, description, metadata, due_at.",
          },
          {
            method: "DELETE",
            path: `/api/tasks/${found.id}`,
            description: "Delete this task permanently.",
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

  const now = new Date();
  const updates: Partial<typeof task.$inferInsert> = { updatedAt: now };

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.assignee !== undefined) updates.assignee = body.assignee;
  if (body.metadata !== undefined) updates.metadata = body.metadata;
  if (body.list_id !== undefined) updates.listId = body.list_id;

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
