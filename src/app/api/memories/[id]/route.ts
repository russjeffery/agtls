import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { memory } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  viewerUser,
  type Viewer,
} from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeMemory } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse, errorHtmlResponse } from "@/lib/api/html";
import { memoryPatchSchema as updateSchema } from "@/lib/api/schemas";

type Params = { params: Promise<{ id: string }> };

async function getMemoryOrError(id: string) {
  const rows = await db.select().from(memory).where(eq(memory.id, id)).limit(1);
  return rows[0] ?? null;
}

function checkOwnership(
  row: typeof memory.$inferSelect,
  viewer: Viewer
): boolean {
  return viewerCanAccess(row.organizationId, viewer);
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const row = await getMemoryOrError(id);
  if (!row) {
    if (wantsHtml(request)) {
      return errorHtmlResponse(
        {
          status: 404,
          title: "Memory not found",
          message: `No memory with ID '${id}' exists. It may have been deleted.`,
          user: viewerUser(viewer),
        },
        request
      );
    }
    return errorResponse(errors.notFound("memory", id), 404);
  }

  if (!checkOwnership(row, viewer)) {
    if (wantsHtml(request)) {
      return errorHtmlResponse(
        {
          status: 403,
          title: "You don't have access to this memory",
          message:
            "This memory belongs to another organization. Sign in with an account that's a member of the owning organization, or use its API key.",
          user: viewerUser(viewer),
        },
        request
      );
    }
    return errorResponse(errors.forbidden(), 403);
  }

  const serialized = serializeMemory(row);

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: row.id,
        objectType: "memory",
        user: viewerUser(viewer),
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "memories", href: "/api/memories" },
          { label: row.id },
        ],
        resource: serialized,
        apiRef: [
          {
            method: "GET",
            path: `/api/memories/${id}`,
            description: "Get this memory.",
          },
          {
            method: "PATCH",
            path: `/api/memories/${id}`,
            description: "Update name or content.",
          },
          {
            method: "DELETE",
            path: `/api/memories/${id}`,
            description: "Delete this memory.",
          },
        ],
      },
      request
    );
  }

  return ok(serialized);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const row = await getMemoryOrError(id);
  if (!row) {
    return errorResponse(errors.notFound("memory", id), 404);
  }

  if (!checkOwnership(row, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  let body;
  try {
    body = updateSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  const updates: Partial<typeof memory.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if (body.content !== undefined) updates.content = body.content;
  if (body.format !== undefined) updates.format = body.format;

  const [updated] = await db
    .update(memory)
    .set(updates)
    .where(eq(memory.id, id))
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/memories/${id}`, request.url).toString(),
      303
    );
  }

  return ok(serializeMemory(updated));
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const row = await getMemoryOrError(id);
  if (!row) {
    return errorResponse(errors.notFound("memory", id), 404);
  }

  if (!checkOwnership(row, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  await db.delete(memory).where(eq(memory.id, id));

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL("/api/memories", request.url).toString(),
      303
    );
  }

  return noContent();
}
