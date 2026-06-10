import { NextRequest } from "next/server";
import { eq, desc, and, lt, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, organization, member } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";
import { createOrgWithOwner } from "@/lib/orgs/service";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeOrganization } from "@/lib/api/serialize";
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
      return Response.redirect(new URL("/sign-in", request.url).toString(), 302);
    }
    return errorResponse(errors.unauthorized(), 401);
  }

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const after = searchParams.get("after");

  // Membership-based, not ownership-based: agents' orgs that the user was
  // added to (or took over) show up here too.
  const memberships = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, session.user.id));
  const orgIds = memberships.map((m) => m.organizationId);

  let rows: (typeof organization.$inferSelect)[] = [];
  if (orgIds.length > 0) {
    const conditions = [inArray(organization.id, orgIds)];
    if (after) {
      const [cursor] = await db
        .select({ createdAt: organization.createdAt })
        .from(organization)
        .where(eq(organization.id, after))
        .limit(1);
      if (cursor) conditions.push(lt(organization.createdAt, cursor.createdAt));
    }

    rows = await db
      .select()
      .from(organization)
      .where(and(...conditions))
      .orderBy(desc(organization.createdAt))
      .limit(limit + 1);
  }

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serializeOrganization);
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: "Organizations",
        user: { name: session.user.name, email: session.user.email },
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "organizations", href: "/api/organizations" },
        ],
        description:
          "Organizations you belong to. Humans and agents are both members; API keys authenticate requests against an organization's resources.",
        list: {
          items: data as Record<string, unknown>[],
          columns: [
            { key: "id", label: "ID", mono: true },
            { key: "name", label: "Name" },
            { key: "slug", label: "Slug", mono: true },
            { key: "created_at", label: "Created" },
          ],
          itemHref: (item) => `/api/organizations/${(item as { id: string }).id}`,
          hasMore,
          nextCursor,
        },
        apiRef: [
          { method: "GET", path: "/api/organizations", description: "List organizations you belong to. Requires browser session." },
          { method: "POST", path: "/api/organizations", description: "Create an organization." },
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
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, body.slug))
    .limit(1);

  if (existing.length > 0) {
    return errorResponse(
      errors.invalidParam("slug", `The slug '${body.slug}' is already taken.`),
      400
    );
  }

  const orgId = await createOrgWithOwner(session.user.id, body.name, body.slug);
  const [row] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  if (wantsHtml(request)) {
    return Response.redirect(new URL(`/api/organizations/${row.id}`, request.url).toString(), 303);
  }
  return created(serializeOrganization(row));
}
