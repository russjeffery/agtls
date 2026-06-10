import { NextRequest } from "next/server";
import { eq, and, desc, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { subtask, task } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  viewerUser,
} from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeSubtask } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse, errorHtmlResponse } from "@/lib/api/html";

type RouteContext = { params: Promise<{ id: string }> };

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignee: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  due_at: z.number().int().optional().nullable(),
});

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

  const { id: taskId } = await params;

  // Verify the task exists and caller can access it
  const [taskRow] = await db
    .select()
    .from(task)
    .where(eq(task.id, taskId))
    .limit(1);

  if (!taskRow) {
    if (wantsHtml(request)) {
      return errorHtmlResponse(
        {
          status: 404,
          title: "Task not found",
          message: `No task with ID '${taskId}' exists. It may have been deleted.`,
          user: viewerUser(viewer),
        },
        request
      );
    }
    return errorResponse(errors.notFound("task", taskId), 404);
  }

  if (!viewerCanAccess(taskRow.organizationId, viewer)) {
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

  const { searchParams } = request.nextUrl;
  const rawLimit = parseInt(searchParams.get("limit") ?? "20");
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 20 : rawLimit), 100);
  const after = searchParams.get("after");

  // Cursor
  let cursorCondition;
  if (after) {
    const [cursorRow] = await db
      .select({ createdAt: subtask.createdAt })
      .from(subtask)
      .where(eq(subtask.id, after))
      .limit(1);
    if (cursorRow) {
      cursorCondition = lt(subtask.createdAt, cursorRow.createdAt);
    }
  }

  const baseCondition = eq(subtask.taskId, taskId);
  const conditions = cursorCondition
    ? and(baseCondition, cursorCondition)
    : baseCondition;

  const rows = await db
    .select()
    .from(subtask)
    .where(conditions)
    .orderBy(desc(subtask.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serializeSubtask);
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: "Subtasks",
        objectType: "subtask",
        user: viewerUser(viewer),
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "tasks", href: "/api/tasks" },
          { label: taskId, href: `/api/tasks/${taskId}` },
          { label: "subtasks" },
        ],
        description: `Subtasks in task ${taskId}.`,
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
            path: `/api/tasks/${taskId}/subtasks`,
            description: "List subtasks in this task. Supports ?limit=, ?after=",
          },
          {
            method: "POST",
            path: `/api/tasks/${taskId}/subtasks`,
            description: "Create a subtask in this task.",
          },
        ],
      },
      request
    );
  }

  return listResponse(data, hasMore, nextCursor);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }
  const auth = viewer.auth;

  const { id: taskId } = await params;

  // Verify the task exists and caller can access/write it
  const [taskRow] = await db
    .select()
    .from(task)
    .where(eq(task.id, taskId))
    .limit(1);

  if (!taskRow) return errorResponse(errors.notFound("task", taskId), 404);

  if (!viewerCanAccess(taskRow.organizationId, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  // Ownership of the new row: an API key pins it to that org; a session user
  // creating under an owned parent task inherits the parent's org; otherwise
  // the subtask is public.
  const organizationId =
    auth?.organizationId ?? (viewer.session ? taskRow.organizationId : null);

  const id = newId("subtask");
  const now = new Date();

  // Public creation gets a claim token so the resource can later be attached
  // to an organization via POST /api/claim/{id}. Returned in plaintext exactly once.
  const claim = organizationId ? null : mintResourceClaimToken();

  const [row] = await db
    .insert(subtask)
    .values({
      id,
      organizationId,
      taskId,
      title: body.title,
      description: body.description ?? null,
      status: body.status ?? "todo",
      priority: body.priority ?? "medium",
      assignee: body.assignee ?? null,
      metadata: body.metadata ?? {},
      dueAt: body.due_at != null ? new Date(body.due_at * 1000) : null,
      completedAt: null,
      claimTokenHash: claim?.hash ?? null,
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

  return created(
    claim
      ? {
          ...serializeSubtask(row),
          claim_token: claim.token,
          claim_url: `/api/claim/${row.id}`,
        }
      : serializeSubtask(row)
  );
}
