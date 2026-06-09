import { NextRequest } from "next/server";
import { eq, and, isNull, desc, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { subtask, task } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeSubtask } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  task_id: z.string().optional().nullable(),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignee: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  due_at: z.number().int().optional().nullable(),
});

export async function GET(request: NextRequest) {
  let auth;
  try {
    auth = await resolveAuth(request);
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
  const statusFilter = searchParams.get("status") as
    | "todo"
    | "in_progress"
    | "done"
    | "cancelled"
    | null;
  const priorityFilter = searchParams.get("priority") as
    | "low"
    | "medium"
    | "high"
    | "urgent"
    | null;
  const assigneeFilter = searchParams.get("assignee");
  const taskIdFilter = searchParams.get("task_id");

  // Ownership filter
  const ownerCondition = auth
    ? eq(subtask.projectId, auth.projectId)
    : isNull(subtask.projectId);

  // Build conditions array
  const conditions = [ownerCondition];

  if (statusFilter) {
    const valid = ["todo", "in_progress", "done", "cancelled"];
    if (!valid.includes(statusFilter)) {
      return errorResponse(
        errors.invalidParam("status", `Invalid status value '${statusFilter}'.`),
        400
      );
    }
    conditions.push(eq(subtask.status, statusFilter));
  }

  if (priorityFilter) {
    const valid = ["low", "medium", "high", "urgent"];
    if (!valid.includes(priorityFilter)) {
      return errorResponse(
        errors.invalidParam(
          "priority",
          `Invalid priority value '${priorityFilter}'.`
        ),
        400
      );
    }
    conditions.push(eq(subtask.priority, priorityFilter));
  }

  if (assigneeFilter) {
    conditions.push(eq(subtask.assignee, assigneeFilter));
  }

  if (taskIdFilter) {
    conditions.push(eq(subtask.taskId, taskIdFilter));
  }

  // Cursor pagination
  if (after) {
    const [cursorRow] = await db
      .select({ createdAt: subtask.createdAt })
      .from(subtask)
      .where(eq(subtask.id, after))
      .limit(1);
    if (cursorRow) {
      conditions.push(lt(subtask.createdAt, cursorRow.createdAt));
    }
  }

  const rows = await db
    .select()
    .from(subtask)
    .where(and(...conditions))
    .orderBy(desc(subtask.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serializeSubtask);
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: "Subtasks",
        breadcrumb: [
          { label: "API", href: "/" },
          { label: "subtasks", href: "/api/subtasks" },
        ],
        description:
          "All subtasks. Filter by task_id, status, priority, or assignee.",
        list: {
          items: data as Record<string, unknown>[],
          columns: [
            { key: "id", label: "ID", mono: true },
            { key: "title", label: "Title" },
            { key: "task_id", label: "Task", mono: true },
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
          hasMore,
          nextCursor,
        },
        apiRef: [
          {
            method: "GET",
            path: "/api/subtasks",
            description:
              "List subtasks. Supports ?status=, ?priority=, ?task_id=, ?assignee=, ?limit=, ?after=",
          },
          {
            method: "POST",
            path: "/api/subtasks",
            description: "Create a subtask.",
          },
        ],
      },
      request
    );
  }

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

  // If task_id provided, validate it exists and caller can write to it
  if (body.task_id) {
    const [taskRow] = await db
      .select()
      .from(task)
      .where(eq(task.id, body.task_id))
      .limit(1);

    if (!taskRow) {
      return errorResponse(errors.notFound("task", body.task_id), 404);
    }

    if (taskRow.projectId !== null) {
      if (!auth || auth.projectId !== taskRow.projectId) {
        return errorResponse(errors.forbidden(), 403);
      }
    }
  }

  const id = newId("subtask");
  const now = new Date();

  const [row] = await db
    .insert(subtask)
    .values({
      id,
      projectId: auth ? auth.projectId : null,
      taskId: body.task_id ?? null,
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? "todo",
      priority: body.priority ?? "medium",
      assignee: body.assignee ?? null,
      metadata: body.metadata ?? {},
      dueAt: body.due_at != null ? new Date(body.due_at * 1000) : null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/subtasks/${row.id}`, request.url).toString(),
      303
    );
  }

  return created(serializeSubtask(row));
}
