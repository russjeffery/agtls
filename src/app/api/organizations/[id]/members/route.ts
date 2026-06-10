import { NextRequest } from "next/server";
import { auth as betterAuth } from "@/lib/auth/server";
import { getMembership } from "@/lib/orgs/service";
import { listOrgMembers } from "@/lib/orgs/queries";
import { errorResponse, listResponse, toUnix } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";
import { headers } from "next/headers";

type RouteContext = { params: Promise<{ id: string }> };

// The headline view of the org model: a signed-in human sees every member of
// the org — including the agents that registered or were claimed into it.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const session = await betterAuth.api.getSession({ headers: await headers() });
  if (!session) {
    if (wantsHtml(request)) {
      return Response.redirect(new URL("/sign-in", request.url).toString(), 302);
    }
    return errorResponse(errors.unauthorized(), 401);
  }

  const membership = await getMembership(id, session.user.id);
  if (!membership) {
    // 404, not 403 — don't leak org existence to non-members.
    return errorResponse(errors.notFound("organization", id), 404);
  }

  const members = await listOrgMembers(id);
  const data = members.map((m) => ({
    id: m.memberId,
    object: "member" as const,
    organization_id: id,
    user_id: m.userId,
    name: m.name,
    email: m.email,
    role: m.role,
    is_agent: m.isAgent,
    agent: m.agent
      ? {
          registration_id: m.agent.registrationId,
          type: m.agent.type,
          status: m.agent.status,
          platform: m.agent.platform,
          created_at: toUnix(m.agent.createdAt),
        }
      : null,
    created_at: toUnix(m.joinedAt),
  }));

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: "Members",
        user: { name: session.user.name, email: session.user.email },
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "organizations", href: "/api/organizations" },
          { label: id, href: `/api/organizations/${id}` },
          { label: "members" },
        ],
        description:
          "Members of this organization. Humans and agents alike — every member's credentials reach the same resources.",
        list: {
          items: data as unknown as Record<string, unknown>[],
          columns: [
            { key: "name", label: "Name" },
            { key: "email", label: "Email", mono: true },
            { key: "role", label: "Role", badge: { owner: "#34d399", admin: "#60a5fa", member: "#a1a1aa" } },
            { key: "is_agent", label: "Agent" },
            { key: "created_at", label: "Joined" },
          ],
          hasMore: false,
          nextCursor: null,
        },
        apiRef: [
          { method: "GET", path: `/api/organizations/${id}/members`, description: "List members — humans and agents. Requires browser session." },
        ],
      },
      request
    );
  }

  return listResponse(data, false, null, data.length);
}
