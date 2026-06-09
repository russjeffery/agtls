import { NextRequest } from "next/server";
import { eq, and, isNull, desc, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { taskList } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeTaskList } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
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

  // Build ownership filter
  const ownerCondition = auth
    ? eq(taskList.projectId, auth.projectId)
    : isNull(taskList.projectId);

  // Cursor: resolve createdAt of the "after" row to do time-based pagination
  let cursorCondition;
  if (after) {
    const [cursorRow] = await db
      .select({ createdAt: taskList.createdAt })
      .from(taskList)
      .where(eq(taskList.id, after))
      .limit(1);

    if (cursorRow) {
      cursorCondition = lt(taskList.createdAt, cursorRow.createdAt);
    }
  }

  const conditions = cursorCondition
    ? and(ownerCondition, cursorCondition)
    : ownerCondition;

  const rows = await db
    .select()
    .from(taskList)
    .where(conditions)
    .orderBy(desc(taskList.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serializeTaskList);
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: "Task Lists",
        breadcrumb: [
          { label: "API", href: "/" },
          { label: "task-lists", href: "/api/task-lists" },
        ],
        description:
          "All task lists accessible to you. Pass Authorization: Bearer agt_... to see your project's task lists.",
        list: {
          items: data as Record<string, unknown>[],
          columns: [
            { key: "id", label: "ID", mono: true },
            { key: "name", label: "Name" },
            { key: "description", label: "Description" },
            { key: "created_at", label: "Created" },
          ],
          itemHref: (item) =>
            `/api/task-lists/${(item as { id: string }).id}`,
          hasMore,
          nextCursor,
        },
        apiRef: [
          {
            method: "GET",
            path: "/api/task-lists",
            description:
              "List task lists. Supports ?limit=, ?after=",
          },
          {
            method: "POST",
            path: "/api/task-lists",
            description: "Create a task list.",
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

  const id = newId("taskList");
  const now = new Date();

  const [row] = await db
    .insert(taskList)
    .values({
      id,
      projectId: auth ? auth.projectId : null,
      name: body.name,
      description: body.description ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/task-lists/${row.id}`, request.url).toString(),
      303
    );
  }

  return created(serializeTaskList(row));
}
