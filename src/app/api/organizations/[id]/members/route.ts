import { NextRequest } from "next/server";
import { auth as betterAuth } from "@/lib/auth/server";
import { getMembership } from "@/lib/orgs/service";
import { listOrgMembers } from "@/lib/orgs/queries";
import { errorResponse, listResponse, toUnix } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { headers } from "next/headers";

type RouteContext = { params: Promise<{ id: string }> };

// The headline view of the org model: a signed-in human sees every member of
// the org — including the agents that registered or were claimed into it.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const session = await betterAuth.api.getSession({ headers: await headers() });
  if (!session) {
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

  return listResponse(data, false, null, data.length);
}
