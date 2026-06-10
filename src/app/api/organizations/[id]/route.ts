import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, organization } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";
import { getMembership } from "@/lib/orgs/service";
import { ok, noContent, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeOrganization } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";
import { headers } from "next/headers";

// Reads require membership; writes require the owner or admin role. The 404
// for non-members (rather than 403) avoids leaking org existence.
async function requireMember(orgId: string, roles?: string[]) {
  const session = await betterAuth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const membership = await getMembership(orgId, session.user.id);
  if (!membership) throw new Error("NotFound");
  if (roles && !roles.includes(membership.role)) throw new Error("NotFound");

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) throw new Error("NotFound");
  return { session, org, membership };
}

function accessError(e: unknown, id: string) {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "NotFound")
    return errorResponse(errors.notFound("organization", id), 404);
  return errorResponse(errors.unauthorized(), 401);
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  let org, session;
  try {
    ({ org, session } = await requireMember(id));
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "Unauthorized" && wantsHtml(request)) {
      return Response.redirect(new URL("/sign-in", request.url).toString(), 302);
    }
    return accessError(e, id);
  }

  const serialized = serializeOrganization(org);

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: org.id,
        objectType: "organization",
        user: { name: session.user.name, email: session.user.email },
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "organizations", href: "/api/organizations" },
          { label: org.id },
        ],
        resource: serialized,
        apiRef: [
          { method: "GET", path: `/api/organizations/${id}`, description: "Get this organization." },
          { method: "PATCH", path: `/api/organizations/${id}`, description: "Update organization name. Requires the owner or admin role." },
          { method: "DELETE", path: `/api/organizations/${id}`, description: "Delete this organization and all its resources. Requires the owner role." },
          { method: "GET", path: `/api/organizations/${id}/members`, description: "List members — humans and agents." },
          { method: "GET", path: `/api/organizations/${id}/keys`, description: "List API keys for this organization." },
          { method: "POST", path: `/api/organizations/${id}/keys`, description: "Create a new API key. The key is shown only once." },
        ],
      },
      request
    );
  }

  return ok(serialized);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  let org;
  try {
    ({ org } = await requireMember(id, ["owner", "admin"]));
  } catch (e: unknown) {
    return accessError(e, id);
  }

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  if (!body.name) return ok(serializeOrganization(org));

  const [updated] = await db
    .update(organization)
    .set({ name: body.name })
    .where(eq(organization.id, id))
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(new URL(`/api/organizations/${id}`, request.url).toString(), 303);
  }
  return ok(serializeOrganization(updated));
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  try {
    await requireMember(id, ["owner"]);
  } catch (e: unknown) {
    return accessError(e, id);
  }

  await db.delete(organization).where(eq(organization.id, id));

  if (wantsHtml(request)) {
    return Response.redirect(new URL("/api/organizations", request.url).toString(), 303);
  }
  return noContent();
}
