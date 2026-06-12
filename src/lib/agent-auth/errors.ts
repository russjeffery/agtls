import { NextResponse } from "next/server";

// Error codes from the auth.md spec. The agent-auth endpoints return a flat
// { error, message } envelope (matching the spec examples), distinct from the
// nested { error: { type, code, ... } } envelope used by the resource API.

export type AgentAuthErrorCode =
  // ID-JAG verification
  | "invalid_issuer"
  | "invalid_signature"
  | "expired"
  | "replay_detected"
  | "invalid_audience"
  | "invalid_client_id"
  | "missing_verified_email"
  | "unsupported_credential_type"
  | "insufficient_user_authentication"
  // request shape
  | "invalid_request"
  | "unsupported_type"
  | "invalid_login_hint"
  | "service_auth_not_enabled"
  // claim ceremony
  | "invalid_claim_token"
  | "claimed_or_in_flight"
  | "claim_expired"
  | "otp_invalid"
  | "otp_expired"
  | "previously_claimed"
  // infra
  | "rate_limited"
  | "server_error";

const STATUS: Record<AgentAuthErrorCode, number> = {
  invalid_issuer: 401,
  invalid_signature: 401,
  expired: 401,
  replay_detected: 401,
  invalid_audience: 401,
  invalid_client_id: 401,
  missing_verified_email: 400,
  unsupported_credential_type: 400,
  insufficient_user_authentication: 401,
  invalid_request: 400,
  unsupported_type: 400,
  invalid_login_hint: 400,
  service_auth_not_enabled: 400,
  invalid_claim_token: 404,
  claimed_or_in_flight: 409,
  claim_expired: 410,
  otp_invalid: 401,
  otp_expired: 410,
  previously_claimed: 409,
  rate_limited: 429,
  server_error: 500,
};

export class AgentAuthError extends Error {
  code: AgentAuthErrorCode;
  constructor(code: AgentAuthErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = "AgentAuthError";
  }
  get status(): number {
    return STATUS[this.code];
  }
}

export function agentAuthErrorResponse(err: unknown): NextResponse {
  if (err instanceof AgentAuthError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: err.status }
    );
  }
  // Never leak internals.
  return NextResponse.json(
    { error: "server_error", message: "An unexpected error occurred." },
    { status: 500 }
  );
}
