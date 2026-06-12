import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artifact } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  type Viewer,
} from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeArtifact } from "@/lib/api/serialize";
import { artifactPatchSchema as updateSchema } from "@/lib/api/schemas";

type Params = { params: Promise<{ id: string }> };

async function getArtifactOrError(id: string) {
  const rows = await db.select().from(artifact).where(eq(artifact.id, id)).limit(1);
  return rows[0] ?? null;
}

function checkOwnership(
  row: typeof artifact.$inferSelect,
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

  const row = await getArtifactOrError(id);
  if (!row) {
    return errorResponse(errors.notFound("artifact", id), 404);
  }

  if (!checkOwnership(row, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  return ok(serializeArtifact(row));
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

  const row = await getArtifactOrError(id);
  if (!row) {
    return errorResponse(errors.notFound("artifact", id), 404);
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

  const updates: Partial<typeof artifact.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if (body.content !== undefined) updates.content = body.content;
  if (body.format !== undefined) updates.format = body.format;

  const [updated] = await db
    .update(artifact)
    .set(updates)
    .where(eq(artifact.id, id))
    .returning();

  return ok(serializeArtifact(updated));
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

  const row = await getArtifactOrError(id);
  if (!row) {
    return errorResponse(errors.notFound("artifact", id), 404);
  }

  if (!checkOwnership(row, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  await db.delete(artifact).where(eq(artifact.id, id));

  return noContent();
}
