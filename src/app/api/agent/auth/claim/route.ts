import { NextRequest, NextResponse } from "next/server";
import { handleClaim } from "@/lib/agent-auth/service";
import { agentAuthErrorResponse, AgentAuthError } from "@/lib/agent-auth/errors";

// POST /agent/auth/claim — start the OTP claim ceremony (anonymous-start only;
// email-required registrations send their email at /agent/auth already).
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
    const result = await handleClaim(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return agentAuthErrorResponse(err);
  }
}
