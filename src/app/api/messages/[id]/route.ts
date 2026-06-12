import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduledMessage } from "@/lib/db/schema";
import {
  resolveViewer,
  viewerCanAccess,
  type Viewer,
} from "@/lib/api/middleware";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeScheduledMessage } from "@/lib/api/serialize";
import { messagePatchSchema as updateSchema } from "@/lib/api/schemas";

type Params = { params: Promise<{ id: string }> };

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function getMessageOrError(id: string) {
  const rows = await db
    .select()
    .from(scheduledMessage)
    .where(eq(scheduledMessage.id, id))
    .limit(1);
  return rows[0] ?? null;
}

function checkOwnership(
  row: typeof scheduledMessage.$inferSelect,
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

  const row = await getMessageOrError(id);
  if (!row) {
    return errorResponse(errors.notFound("scheduled message", id), 404);
  }

  if (!checkOwnership(row, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  return ok(serializeScheduledMessage(row));
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

  const row = await getMessageOrError(id);
  if (!row) {
    return errorResponse(errors.notFound("scheduled message", id), 404);
  }

  if (!checkOwnership(row, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  // A message can only be edited while it's still waiting to fire.
  if (row.status !== "scheduled") {
    return errorResponse(
      errors.invalidParam(
        "status",
        `This message is '${row.status}' and can no longer be edited.`
      ),
      400
    );
  }

  let body;
  try {
    body = updateSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  if (body.url !== undefined && !isHttpUrl(body.url)) {
    return errorResponse(
      errors.invalidParam("url", "url must be an http or https URL."),
      400
    );
  }

  const updates: Partial<typeof scheduledMessage.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.url !== undefined) updates.url = body.url;
  if (body.method !== undefined) updates.method = body.method;
  if ("headers" in body) updates.headers = body.headers ?? null;
  if ("body" in body) updates.body = body.body ?? null;
  if (body.scheduled_at !== undefined) {
    updates.scheduledAt = new Date(body.scheduled_at * 1000);
  } else if (body.delay_seconds !== undefined) {
    updates.scheduledAt = new Date(Date.now() + body.delay_seconds * 1000);
  }

  const [updated] = await db
    .update(scheduledMessage)
    .set(updates)
    .where(eq(scheduledMessage.id, id))
    .returning();

  return ok(serializeScheduledMessage(updated));
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

  const row = await getMessageOrError(id);
  if (!row) {
    return errorResponse(errors.notFound("scheduled message", id), 404);
  }

  if (!checkOwnership(row, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  // Deleting a still-scheduled message cancels it before it can fire.
  await db.delete(scheduledMessage).where(eq(scheduledMessage.id, id));

  return noContent();
}
