import { NextRequest } from "next/server";
import { eq, and, inArray, desc, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { task } from "@/lib/db/schema";
import {
  resolveAuth,
  resolveViewer,
  viewerOrganizationIds,
  viewerUser,
} from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeTask } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";
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

  // Lists are scoped to the caller's organizations. Anonymous callers (scope null)
  // get an empty list — public resources stay reachable by ID but are never
  // enumerable.
  const scope = viewerOrganizationIds(viewer);

  let rows: (typeof task.$inferSelect)[] = [];
  if (scope !== null && scope.length > 0) {
    const ownerCondition = inArray(task.organizationId, scope);

    // Cursor: resolve createdAt of the "after" row to do time-based pagination
    let cursorCondition;
    if (after) {
      const [cursorRow] = await db
        .select({ createdAt: task.createdAt })
        .from(task)
        .where(eq(task.id, after))
        .limit(1);

      if (cursorRow) {
        cursorCondition = lt(task.createdAt, cursorRow.createdAt);
      }
    }

    const conditions = cursorCondition
      ? and(ownerCondition, cursorCondition)
      : ownerCondition;

    rows = await db
      .select()
      .from(task)
      .where(conditions)
      .orderBy(desc(task.createdAt))
      .limit(limit + 1);
  }

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serializeTask);
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  if (wantsHtml(request)) {
    const signedOut = scope === null;
    return htmlResponse(
      {
        title: "Tasks",
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "tasks", href: "/api/tasks" },
        ],
        description:
          "Tasks are containers for subtasks. Create a task, then add subtasks to track work.",
        user: viewerUser(viewer),
        notice: signedOut
          ? {
              title: "Sign in to see your tasks",
              message:
                "Tasks are scoped to your account. Sign in to list the tasks in your organizations — or pass an API key when calling this endpoint.",
              actions: [
                { label: "Sign in", href: "/sign-in", primary: true },
                { label: "Create an account", href: "/sign-up" },
              ],
            }
          : undefined,
        createForm: signedOut
          ? undefined
          : {
              title: "New task",
              endpoint: "/api/tasks",
              submitLabel: "Create task",
              fields: [
                {
                  name: "name",
                  label: "Name",
                  placeholder: "Ship the onboarding flow",
                  required: true,
                },
                {
                  name: "description",
                  label: "Description",
                  type: "textarea",
                  placeholder: "What this task is for…",
                },
              ],
            },
        list: signedOut
          ? undefined
          : {
          items: data as Record<string, unknown>[],
          columns: [
            { key: "id", label: "ID", mono: true },
            { key: "name", label: "Name" },
            { key: "description", label: "Description" },
            { key: "created_at", label: "Created" },
          ],
          itemHref: (item) => `/api/tasks/${(item as { id: string }).id}`,
          actions: {
            deleteConfirm: (item) =>
              `Delete task ${(item as { id: string }).id}? This permanently deletes all data for this task, including its subtasks.`,
          },
          hasMore,
          nextCursor,
        },
        apiRef: [
          {
            method: "GET",
            path: "/api/tasks",
            description: "List tasks. Supports ?limit=, ?after=",
          },
          {
            method: "POST",
            path: "/api/tasks",
            description: "Create a task.",
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

  const id = newId("task");
  const now = new Date();

  // Public creation gets a claim token so the resource can later be attached
  // to an organization via POST /api/claim/{id}. Returned in plaintext exactly once.
  const claim = auth ? null : mintResourceClaimToken();

  const [row] = await db
    .insert(task)
    .values({
      id,
      organizationId: auth ? auth.organizationId : null,
      name: body.name,
      description: body.description ?? null,
      claimTokenHash: claim?.hash ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/tasks/${row.id}`, request.url).toString(),
      303
    );
  }

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
