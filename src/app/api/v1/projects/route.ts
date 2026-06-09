import { NextRequest } from "next/server";
import { eq, desc, gt, and } from "drizzle-orm";
import { z } from "zod";
import { db, project } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";
import { newId } from "@/lib/api/ids";
import { ok, created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeProject } from "@/lib/api/serialize";
import { headers } from "next/headers";

async function requireSession() {
  const session = await betterAuth.api.getSession({
    headers: await headers(),
  });
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
    return errorResponse(errors.unauthorized(), 401);
  }

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const after = searchParams.get("after");

  const conditions = [eq(project.userId, session.user.id)];
  if (after) conditions.push(gt(project.id, after));

  const rows = await db
    .select()
    .from(project)
    .where(and(...conditions))
    .orderBy(desc(project.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serializeProject);

  return listResponse(data, hasMore, hasMore ? data[data.length - 1].id : null);
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

  // Check slug uniqueness
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
    .values({
      id,
      userId: session.user.id,
      name: body.name,
      slug: body.slug,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created(serializeProject(row));
}
