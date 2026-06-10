import { NextRequest } from "next/server";
import { eq, and, inArray, desc, lt, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { subtask, task } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  viewerOrganizationIds,
  viewerUser,
} from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeSubtask } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";
import { subtaskCreateSchema as createSchema } from "@/lib/api/schemas";

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

  // Lists are scoped to the caller's organizations. Anonymous callers (scope
  // null) get an empty list — public subtasks stay reachable by ID but are
  // never enumerable.
  const scope = viewerOrganizationIds(viewer);

  // Build conditions array
  const conditions: SQL[] = [];
  if (scope !== null && scope.length > 0) {
    conditions.push(inArray(subtask.organizationId, scope));
  }

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

  const rows =
    scope !== null && scope.length > 0
      ? await db
          .select()
          .from(subtask)
          .where(and(...conditions))
          .orderBy(desc(subtask.createdAt))
          .limit(limit + 1)
      : [];

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serializeSubtask);
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  if (wantsHtml(request)) {
    const signedOut = scope === null;
    return htmlResponse(
      {
        title: "Subtasks",
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "subtasks", href: "/api/subtasks" },
        ],
        description:
          "All subtasks. Filter by task_id, status, priority, or assignee.",
        user: viewerUser(viewer),
        notice: signedOut
          ? {
              title: "Sign in to see your subtasks",
              message:
                "Subtasks are scoped to your account. Sign in to list the subtasks in your organizations — or pass an API key when calling this endpoint.",
              actions: [
                { label: "Sign in", href: "/sign-in", primary: true },
                { label: "Create an account", href: "/sign-up" },
              ],
            }
          : undefined,
        list: signedOut
          ? undefined
          : {
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

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  // If task_id provided, validate it exists and caller can write to it
  let parentOrgId: string | null = null;
  if (body.task_id) {
    const [taskRow] = await db
      .select()
      .from(task)
      .where(eq(task.id, body.task_id))
      .limit(1);

    if (!taskRow) {
      return errorResponse(errors.notFound("task", body.task_id), 404);
    }

    if (!viewerCanAccess(taskRow.organizationId, viewer)) {
      return errorResponse(errors.forbidden(), 403);
    }
    parentOrgId = taskRow.organizationId;
  }

  // Ownership of the new row: an API key pins it to that org; a session user
  // creating under an owned parent task inherits the parent's org; otherwise
  // the subtask is public.
  const organizationId =
    auth?.organizationId ?? (viewer.session ? parentOrgId : null);

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
      taskId: body.task_id ?? null,
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
