import { NextRequest } from "next/server";
import { eq, desc, and, lt } from "drizzle-orm";
import { z } from "zod";
import { db, project } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
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

const createSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric and hyphens only"),
});

export async function GET(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    if (wantsHtml(request)) {
      return Response.redirect(new URL("/api/auth/sign-in", request.url).toString(), 302);
    }
    return errorResponse(errors.unauthorized(), 401);
  }

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const after = searchParams.get("after");

  const conditions = [eq(project.userId, session.user.id)];
  if (after) {
    const [cursor] = await db
      .select({ createdAt: project.createdAt })
      .from(project)
      .where(eq(project.id, after))
      .limit(1);
    if (cursor) conditions.push(lt(project.createdAt, cursor.createdAt));
  }

  const rows = await db
    .select()
    .from(project)
    .where(and(...conditions))
    .orderBy(desc(project.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serializeProject);
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: "Projects",
        breadcrumb: [{ label: "API", href: "/" }, { label: "projects", href: "/api/projects" }],
        description: "Your projects. Each project gets API keys used to authenticate requests.",
        list: {
          items: data as Record<string, unknown>[],
          columns: [
            { key: "id", label: "ID", mono: true },
            { key: "name", label: "Name" },
            { key: "slug", label: "Slug", mono: true },
            { key: "created_at", label: "Created" },
          ],
          itemHref: (item) => `/api/projects/${(item as { id: string }).id}`,
          hasMore,
          nextCursor,
        },
        apiRef: [
          { method: "GET", path: "/api/projects", description: "List your projects. Requires browser session." },
          { method: "POST", path: "/api/projects", description: "Create a project." },
        ],
      },
      request
    );
  }

  return listResponse(data, hasMore, nextCursor);
}

export async function POST(request: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return errorResponse(errors.unauthorized(), 401);
  }

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  const existing = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.slug, body.slug))
    .limit(1);

  if (existing.length > 0) {
    return errorResponse(
      errors.invalidParam("slug", `The slug '${body.slug}' is already taken.`),
      400
    );
  }

  const id = newId("project");
  const now = new Date();

  const [row] = await db
    .insert(project)
    .values({ id, userId: session.user.id, name: body.name, slug: body.slug, createdAt: now, updatedAt: now })
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(new URL(`/api/projects/${row.id}`, request.url).toString(), 303);
  }
  return created(serializeProject(row));
}
