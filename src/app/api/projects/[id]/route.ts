import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db, project } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeProject } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";
import { headers } from "next/headers";

async function requireSession() {
  const session = await betterAuth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  return session;
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  let session;
  try {
    session = await requireSession();
  } catch {
    if (wantsHtml(request)) {
      return Response.redirect(new URL("/api/auth/sign-in", request.url).toString(), 302);
    }
    return errorResponse(errors.unauthorized(), 401);
  }

  const { id } = await params;
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, session.user.id)))
    .limit(1);

  if (!row) return errorResponse(errors.notFound("project", id), 404);

  const serialized = serializeProject(row);

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: row.id,
        objectType: "project",
        breadcrumb: [
          { label: "API", href: "/" },
          { label: "projects", href: "/api/projects" },
          { label: row.id },
        ],
        resource: serialized,
        apiRef: [
          { method: "GET", path: `/api/projects/${id}`, description: "Get this project." },
          { method: "PATCH", path: `/api/projects/${id}`, description: "Update project name." },
          { method: "DELETE", path: `/api/projects/${id}`, description: "Delete this project and all its resources." },
          { method: "GET", path: `/api/projects/${id}/keys`, description: "List API keys for this project." },
          { method: "POST", path: `/api/projects/${id}/keys`, description: "Create a new API key. The key is shown only once." },
        ],
      },
      request
    );
  }

  return ok(serialized);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return errorResponse(errors.unauthorized(), 401);
  }

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, session.user.id)))
    .limit(1);

  if (!existing) return errorResponse(errors.notFound("project", id), 404);

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  if (!body.name) return ok(serializeProject(existing));

  const [updated] = await db
    .update(project)
    .set({ name: body.name, updatedAt: new Date() })
    .where(eq(project.id, id))
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(new URL(`/api/projects/${id}`, request.url).toString(), 303);
  }
  return ok(serializeProject(updated));
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return errorResponse(errors.unauthorized(), 401);
  }

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, session.user.id)))
    .limit(1);

  if (!existing) return errorResponse(errors.notFound("project", id), 404);
  await db.delete(project).where(eq(project.id, id));

  if (wantsHtml(request)) {
    return Response.redirect(new URL("/api/projects", request.url).toString(), 303);
  }
  return noContent();
}
