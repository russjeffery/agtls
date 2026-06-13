import { NextRequest, NextResponse } from "next/server";
import { requestClaimLinkForCredential } from "@/lib/agent-auth/service";
import { agentAuthErrorResponse, AgentAuthError } from "@/lib/agent-auth/errors";
import { resolveAuth } from "@/lib/api/middleware";

// POST /agent/auth/claim-link — mint a fresh human-facing claim link for the
// authenticated (anonymous, unclaimed) credential. The agent pastes the
// returned `claim_link` to its human, who opens it, signs in, and claims the
// agent in-session (see /agent/link/[token]). Anonymous registration already
// returns a `claim_link`; this endpoint re-mints one for an agent that
// registered earlier or lost the original.
export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await resolveAuth(request);
  } catch {
    return agentAuthErrorResponse(
      new AgentAuthError(
        "invalid_client_id",
        "The API key provided is invalid or has been revoked."
      )
    );
  }

  if (!auth) {
    return agentAuthErrorResponse(
      new AgentAuthError(
        "invalid_client_id",
        "A credential is required to generate a claim link."
      )
    );
  }

  try {
    const result = await requestClaimLinkForCredential(auth.apiKeyId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return agentAuthErrorResponse(err);
  }
}
