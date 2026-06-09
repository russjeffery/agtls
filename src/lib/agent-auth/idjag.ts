import {
  jwtVerify,
  decodeJwt,
  decodeProtectedHeader,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import { AgentAuthError } from "./errors";
import type { TrustedProvider } from "./trusted-providers";

// Pure(ish) ID-JAG and logout-token verification. All side-effecting
// dependencies — provider lookup, JWKS resolution, the jti replay check — are
// injected, so the verification logic is unit-testable with an in-memory
// keypair and no network or DB.

const REVOKED_EVENT =
  "https://schemas.workos.com/events/agent/auth/identity/assertion/revoked";

const ALLOWED_ALGS = ["RS256", "RS384", "RS512", "ES256", "ES384", "EdDSA"];

export interface VerifiedAssertion {
  iss: string;
  sub: string;
  aud: string;
  clientId: string;
  jti: string;
  iat: number;
  exp: number;
  email?: string;
  emailVerified: boolean;
  phoneNumber?: string;
  phoneNumberVerified: boolean;
  amr?: string[];
  agentPlatform?: string;
  agentContextId?: string;
  claims: JWTPayload;
}

export interface VerifyDeps {
  expectedAudience: string;
  resolveProvider: (iss: string) => TrustedProvider | undefined;
  jwksUriFor: (provider: TrustedProvider) => string;
  getKeySet: (jwksUri: string) => JWTVerifyGetKey;
  /** Atomic check-and-set: returns false if the jti was already seen. */
  markJtiSeen: (jti: string, expiresAt: Date) => Promise<boolean>;
  now?: () => Date;
  clockToleranceSec?: number;
}

function mapJoseError(err: unknown): AgentAuthError {
  const code = (err as { code?: string } | undefined)?.code;
  switch (code) {
    case "ERR_JWT_EXPIRED":
      return new AgentAuthError("expired", "The assertion has expired.");
    case "ERR_JWT_CLAIM_VALIDATION_FAILED":
      // jose surfaces aud/iss/nbf failures here; we only constrain aud.
      return new AgentAuthError(
        "invalid_audience",
        "The assertion audience does not match this service."
      );
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
    case "ERR_JWKS_NO_MATCHING_KEY":
    case "ERR_JWS_INVALID":
      return new AgentAuthError(
        "invalid_signature",
        "The assertion signature could not be verified."
      );
    default:
      return new AgentAuthError(
        "invalid_signature",
        "The assertion could not be verified."
      );
  }
}

function resolveTrusted(
  token: string,
  deps: VerifyDeps,
  expectedTyp: string
): { provider: TrustedProvider; iss: string } {
  let header: { typ?: string };
  let unverified: JWTPayload;
  try {
    header = decodeProtectedHeader(token);
    unverified = decodeJwt(token);
  } catch {
    throw new AgentAuthError("invalid_signature", "Malformed assertion.");
  }
  if (header.typ && header.typ !== expectedTyp) {
    throw new AgentAuthError(
      "invalid_signature",
      `Unexpected token type '${header.typ}'.`
    );
  }
  const iss = typeof unverified.iss === "string" ? unverified.iss : "";
  const provider = deps.resolveProvider(iss);
  if (!provider) {
    throw new AgentAuthError(
      "invalid_issuer",
      `Issuer '${iss}' is not in the trusted provider list.`
    );
  }
  return { provider, iss };
}

async function verifySignedToken(
  token: string,
  deps: VerifyDeps,
  expectedTyp: string,
  audience: string
): Promise<{ payload: JWTPayload; provider: TrustedProvider }> {
  const { provider } = resolveTrusted(token, deps, expectedTyp);
  const keySet = deps.getKeySet(deps.jwksUriFor(provider));
  const tolerance = deps.clockToleranceSec ?? 90;

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, keySet, {
      audience,
      algorithms: ALLOWED_ALGS,
      clockTolerance: tolerance,
      currentDate: deps.now?.(),
    });
    payload = result.payload;
  } catch (err) {
    throw mapJoseError(err);
  }

  // Guard against assertions issued unreasonably far in the future.
  const nowSec = Math.floor((deps.now?.() ?? new Date()).getTime() / 1000);
  if (typeof payload.iat === "number" && payload.iat > nowSec + tolerance) {
    throw new AgentAuthError("expired", "Assertion `iat` is in the future.");
  }
  return { payload, provider };
}

export async function verifyIdJag(
  assertion: string,
  deps: VerifyDeps
): Promise<VerifiedAssertion> {
  const { payload, provider } = await verifySignedToken(
    assertion,
    deps,
    "oauth-id-jag+jwt",
    deps.expectedAudience
  );

  const clientId =
    typeof payload.client_id === "string" ? payload.client_id : "";
  if (!clientId) {
    throw new AgentAuthError("invalid_client_id", "Missing `client_id` claim.");
  }
  // CIMD resolution (client_id as a Client ID Metadata Document URL) is
  // deferred; for now we compare opaquely when a provider pins a client_id.
  if (provider.clientId && provider.clientId !== clientId) {
    throw new AgentAuthError(
      "invalid_client_id",
      "`client_id` does not match the trusted provider."
    );
  }

  const emailVerified = payload.email_verified === true;
  const phoneNumberVerified = payload.phone_number_verified === true;
  if (!emailVerified && !phoneNumberVerified) {
    throw new AgentAuthError(
      "missing_verified_email",
      "Assertion must carry a verified email or verified phone number."
    );
  }

  const jti = typeof payload.jti === "string" ? payload.jti : "";
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (!jti) {
    throw new AgentAuthError("invalid_signature", "Missing `jti` claim.");
  }

  // Replay check last, so failed validations don't burn a legitimate jti.
  // TTL = exp plus clock skew.
  const replayExpiry = new Date((exp + (deps.clockToleranceSec ?? 90)) * 1000);
  const fresh = await deps.markJtiSeen(jti, replayExpiry);
  if (!fresh) {
    throw new AgentAuthError(
      "replay_detected",
      "This assertion has already been used."
    );
  }

  return {
    iss: payload.iss as string,
    sub: payload.sub as string,
    aud: Array.isArray(payload.aud)
      ? payload.aud[0]
      : (payload.aud as string),
    clientId,
    jti,
    iat: (payload.iat as number) ?? 0,
    exp,
    email: typeof payload.email === "string" ? payload.email : undefined,
    emailVerified,
    phoneNumber:
      typeof payload.phone_number === "string"
        ? payload.phone_number
        : undefined,
    phoneNumberVerified,
    amr: Array.isArray(payload.amr)
      ? (payload.amr as string[])
      : undefined,
    agentPlatform:
      typeof payload.agent_platform === "string"
        ? payload.agent_platform
        : undefined,
    agentContextId:
      typeof payload.agent_context_id === "string"
        ? payload.agent_context_id
        : undefined,
    claims: payload,
  };
}

export interface VerifiedLogoutToken {
  iss: string;
  sub: string;
  aud: string;
  jti: string;
}

export async function verifyLogoutToken(
  token: string,
  deps: VerifyDeps
): Promise<VerifiedLogoutToken> {
  const { payload } = await verifySignedToken(
    token,
    deps,
    "logout+jwt",
    deps.expectedAudience
  );

  const events = payload.events as Record<string, unknown> | undefined;
  if (!events || !(REVOKED_EVENT in events)) {
    throw new AgentAuthError(
      "invalid_signature",
      "Logout token is missing the revocation event."
    );
  }

  const jti = typeof payload.jti === "string" ? payload.jti : "";
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!jti || !sub) {
    throw new AgentAuthError(
      "invalid_signature",
      "Logout token is missing `jti` or `sub`."
    );
  }

  // Replay protection — logout tokens have no exp; cache for a fixed window.
  const fresh = await deps.markJtiSeen(
    jti,
    new Date(Date.now() + 10 * 60 * 1000)
  );
  if (!fresh) {
    throw new AgentAuthError("replay_detected", "Logout token already used.");
  }

  return {
    iss: payload.iss as string,
    sub,
    aud: Array.isArray(payload.aud)
      ? payload.aud[0]
      : (payload.aud as string),
    jti,
  };
}
