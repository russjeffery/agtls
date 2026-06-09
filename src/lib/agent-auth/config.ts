// Central configuration for the agent-auth (auth.md) implementation.
//
// Discovery URLs are derived from NEXT_PUBLIC_APP_URL so the published metadata
// always points at the running deployment rather than a hard-coded host.

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/** Origin used as the resource identifier and audience in discovery + ID-JAGs. */
export function resourceUrl(): string {
  return `${appUrl()}/`;
}

/** Authorization server base — agtls is both resource and auth server. */
export function authServerUrl(): string {
  return `${appUrl()}/`;
}

/** Absolute URL of the Protected Resource Metadata document. */
export function prmUrl(): string {
  return `${appUrl()}/.well-known/oauth-protected-resource`;
}

export function registerUri(): string {
  return `${appUrl()}/api/agent/auth`;
}

export function claimUri(): string {
  return `${appUrl()}/api/agent/auth/claim`;
}

export function revocationUri(): string {
  return `${appUrl()}/api/agent/auth/revoke`;
}

/** Server-rendered OTP view page the claim email links to. */
export function claimViewUrl(viewToken: string): string {
  return `${appUrl()}/agent/claim/${viewToken}`;
}

/** The `aud` value an ID-JAG must target to be accepted here. */
export function expectedAudience(): string {
  return authServerUrl();
}

// ─── Scopes ───────────────────────────────────────────────────────────────────

export const SCOPES_SUPPORTED = ["api.read", "api.write"] as const;

/** Scopes an anonymous (pre-claim, untrusted) credential receives. */
export const PRE_CLAIM_SCOPES = ["api.read"] as const;

/** Scopes granted once a user is verified (claim completed, or ID-JAG). */
export const POST_CLAIM_SCOPES = ["api.read", "api.write"] as const;

// ─── Lifetimes ──────────────────────────────────────────────────────────────

/** access_token credential lifetime. ID-JAGs require a fresh assertion to renew. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

/** How long an unclaimed user-claimed registration stays claimable. */
export const REGISTRATION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** OTP validity once generated on the view page. */
export const OTP_TTL_SECONDS = 10 * 60; // 10 minutes

/** Clock skew tolerance for ID-JAG / logout token timestamps. */
export const CLOCK_TOLERANCE_SECONDS = 90;

export type CredentialType = "access_token" | "api_key";
