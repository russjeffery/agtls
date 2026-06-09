import { NextRequest, NextResponse } from "next/server";
import { handleClaimComplete } from "@/lib/agent-auth/service";
import { agentAuthErrorResponse, AgentAuthError } from "@/lib/agent-auth/errors";

// POST /agent/auth/claim/complete — finish the ceremony. The agent submits the
// OTP it collected from the user. User matching / JIT provisioning happens here.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return agentAuthErrorResponse(
      new AgentAuthError("invalid_request", "Request body must be JSON.")
    );
  }

  try {
    const result = await handleClaimComplete(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return agentAuthErrorResponse(err);
  }
}
