import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, apiKey } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";
import { getMembership } from "@/lib/orgs/service";
import { ok, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeApiKey } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";
import { headers } from "next/headers";

// Any member may inspect a key; revocation requires owner or admin.
async function requireMember(orgId: string, roles?: string[]) {
  const session = await betterAuth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  const membership = await getMembership(orgId, session.user.id);
  if (!membership) throw new Error("NotFound");
  if (roles && !roles.includes(membership.role)) throw new Error("NotFound");
  return { session, membership };
}

function accessError(e: unknown, id: string) {
  const msg = e instanceof Error ? e.message : "";
  if (msg === "NotFound")
    return errorResponse(errors.notFound("organization", id), 404);
  return errorResponse(errors.unauthorized(), 401);
}

type RouteContext = { params: Promise<{ id: string; keyId: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id, keyId } = await params;

  let session;
  try {
    ({ session } = await requireMember(id));
  } catch (e: unknown) {
    return accessError(e, id);
  }

  const [row] = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.id, keyId), eq(apiKey.organizationId, id)))
    .limit(1);

  if (!row) return errorResponse(errors.notFound("api_key", keyId), 404);

  const serialized = serializeApiKey(row);

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: row.id,
        objectType: "api_key",
        user: { name: session.user.name, email: session.user.email },
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "organizations", href: "/api/organizations" },
          { label: id, href: `/api/organizations/${id}` },
          { label: "keys", href: `/api/organizations/${id}/keys` },
          { label: row.id },
        ],
        resource: serialized,
        apiRef: [
          { method: "GET", path: `/api/organizations/${id}/keys/${keyId}`, description: "Get this API key." },
          { method: "DELETE", path: `/api/organizations/${id}/keys/${keyId}`, description: "Revoke this key. Revocation is permanent." },
        ],
      },
      request
    );
  }

  return ok(serialized);
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id, keyId } = await params;

  try {
    await requireMember(id, ["owner", "admin"]);
  } catch (e: unknown) {
    return accessError(e, id);
  }

  const [row] = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.id, keyId), eq(apiKey.organizationId, id)))
    .limit(1);

  if (!row) return errorResponse(errors.notFound("api_key", keyId), 404);

  const [revoked] = await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(eq(apiKey.id, keyId))
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(new URL(`/api/organizations/${id}/keys`, request.url).toString(), 303);
  }
  return ok(serializeApiKey(revoked));
}
