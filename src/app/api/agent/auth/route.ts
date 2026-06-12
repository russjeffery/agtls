import { NextRequest, NextResponse } from "next/server";
import { handleRegister } from "@/lib/agent-auth/service";
import { agentAuthErrorResponse, AgentAuthError } from "@/lib/agent-auth/errors";
import { clientIp } from "@/lib/agent-auth/request";

// POST /agent/auth — shared registration endpoint for all agent-auth flows.
// Dispatches on `type` (and `assertion_type`): identity_assertion+id-jag is the
// agent-verified flow; anonymous and service_auth are the two user-claimed
// entrypoints. See src/lib/agent-auth/service.ts.
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
    const result = await handleRegister(body, { ip: clientIp(request) });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return agentAuthErrorResponse(err);
  }
}
