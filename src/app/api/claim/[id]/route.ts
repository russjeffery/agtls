import { NextRequest } from "next/server";
import { resolveAuth } from "@/lib/api/middleware";
import { ok, errorResponse } from "@/lib/api/response";
import { errors, type ApiError } from "@/lib/api/errors";
import { claimResource, ClaimError } from "@/lib/api/claim";
import { claimSchema } from "@/lib/api/schemas";

type RouteContext = { params: Promise<{ id: string }> };

function claimErrorToResponse(err: ClaimError): Response {
  const map: Record<ClaimError["code"], { error: ApiError; status: number }> = {
    unsupported_id: {
      error: errors.invalidParam("id", err.message),
      status: 400,
    },
    not_found: {
      error: {
        type: "not_found_error",
        code: "resource_not_found",
        message: err.message,
      },
      status: 404,
    },
    already_claimed: { error: errors.alreadyClaimed(err.message), status: 400 },
    not_claimable: { error: errors.notClaimable(err.message), status: 400 },
    invalid_claim_token: {
      error: errors.invalidClaimToken(err.message),
      status: 403,
    },
  };
  const { error, status } = map[err.code];
  return errorResponse(error, status);
}

// POST /api/claim/{id} — take ownership of a publicly-created resource.
// Requires auth (the claimed resource is assigned to the caller's organization);
// any valid key works, including credentials issued through the agent-auth
// anonymous or identity_assertion flows.
export async function POST(request: NextRequest, { params }: RouteContext) {
  let auth;
  try {
    auth = await resolveAuth(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  if (!auth) {
    return errorResponse(
      errors.unauthorized(
        "Claiming a resource requires an API key so it can be assigned to your organization. Register via POST /api/agent/auth to obtain one."
      ),
      401
    );
  }

  const { id } = await params;

  let body;
  try {
    body = claimSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("claim_token", msg), 400);
  }

  let result;
  try {
    result = await claimResource(id, body.claim_token, auth.organizationId);
  } catch (e: unknown) {
    if (e instanceof ClaimError) return claimErrorToResponse(e);
    throw e;
  }

  return ok(result.data);
}
