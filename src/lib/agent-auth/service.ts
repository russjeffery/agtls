import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { agentRegistration } from "@/lib/db/schema";
import { newId } from "@/lib/api/ids";
import { AgentAuthError } from "./errors";
import {
  PRE_CLAIM_SCOPES,
  POST_CLAIM_SCOPES,
  REGISTRATION_TTL_SECONDS,
  OTP_TTL_SECONDS,
  CLOCK_TOLERANCE_SECONDS,
  expectedAudience,
  claimViewUrl,
  claimUri,
  type CredentialType,
} from "./config";
import {
  newClaimToken,
  newClaimViewToken,
  newOtp,
  sha256,
  hashesEqual,
} from "./tokens";
import { verifyIdJag, verifyLogoutToken, type VerifyDeps } from "./idjag";
import { resolveProvider, jwksUriFor } from "./trusted-providers";
import { getRemoteKeySet } from "./jwks";
import { markJtiSeen } from "./replay";
import { recordAuditEvent } from "./audit";
import { enforceRateLimit } from "./rate-limit";
import {
  resolvePrincipalForAssertion,
  createAgentUser,
  createAgentOrg,
  findUserByVerifiedEmail,
  promoteAgentUser,
} from "./users";
import {
  ensureMember,
  findOrCreatePrimaryOrg,
  transferOwnership,
} from "@/lib/orgs/service";
import {
  issueCredential,
  upgradeCredentialScopes,
  revokeCredentialsForRegistrations,
} from "./credentials";
import { sendClaimEmail } from "@/lib/email";

const SERVICE_NAME = "agtls";

const ID_JAG_ASSERTION = "urn:ietf:params:oauth:token-type:id-jag";
const VERIFIED_EMAIL_ASSERTION = "verified_email";

export interface RequestContext {
  ip?: string | null;
}

/** Wire the production dependencies for ID-JAG / logout-token verification. */
function buildVerifyDeps(): VerifyDeps {
  return {
    expectedAudience: expectedAudience(),
    resolveProvider,
    jwksUriFor,
    getKeySet: getRemoteKeySet,
    markJtiSeen,
    clockToleranceSec: CLOCK_TOLERANCE_SECONDS,
  };
}

const credentialTypeSchema = z.enum(["access_token", "api_key"]);

const registerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("identity_assertion"),
    assertion_type: z.string(),
    assertion: z.string().min(1),
    requested_credential_type: credentialTypeSchema.default("api_key"),
  }),
  z.object({
    type: z.literal("anonymous"),
    requested_credential_type: credentialTypeSchema.default("api_key"),
  }),
]);

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

// ─── POST /agent/auth ─────────────────────────────────────────────────────────

export async function handleRegister(
  rawBody: unknown,
  ctx: RequestContext
): Promise<Record<string, unknown>> {
  const parsed = registerSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new AgentAuthError(
      "invalid_request",
      parsed.error.issues[0]?.message ?? "Invalid registration request."
    );
  }
  const body = parsed.data;

  if (body.type === "anonymous") {
    return registerAnonymous(body.requested_credential_type, ctx);
  }

  // type === "identity_assertion" — dispatch on assertion_type.
  if (body.assertion_type === ID_JAG_ASSERTION) {
    return registerAgentVerified(
      body.assertion,
      body.requested_credential_type,
      ctx
    );
  }
  if (body.assertion_type === VERIFIED_EMAIL_ASSERTION) {
    return registerEmailRequired(
      body.assertion,
      body.requested_credential_type,
      ctx
    );
  }
  throw new AgentAuthError(
    "unsupported_type",
    `Unsupported assertion_type '${body.assertion_type}'.`
  );
}

// Agent verified: trusted provider asserts identity via ID-JAG.
async function registerAgentVerified(
  assertion: string,
  requestedCredentialType: CredentialType,
  ctx: RequestContext
): Promise<Record<string, unknown>> {
  enforceRateLimit("identity_assertion", { ip: ctx.ip });

  const verified = await verifyIdJag(assertion, buildVerifyDeps());

  const principal = await resolvePrincipalForAssertion({
    iss: verified.iss,
    sub: verified.sub,
    email: verified.email,
    emailVerified: verified.emailVerified,
  });

  const regId = newId("agentRegistration");
  const scopes = [...POST_CLAIM_SCOPES];
  const cred = await issueCredential({
    organizationId: principal.organizationId,
    credentialType: requestedCredentialType,
    scopes,
    registrationId: regId,
    name: `Agent (${verified.iss})`,
  });

  const now = new Date();
  await db.insert(agentRegistration).values({
    id: regId,
    type: "agent-provider",
    status: "active",
    requestedCredentialType,
    organizationId: principal.organizationId,
    userId: principal.userId,
    apiKeyId: cred.apiKeyId,
    postClaimScopes: scopes,
    email: verified.email ?? null,
    iss: verified.iss,
    sub: verified.sub,
    aud: verified.aud,
    agentPlatform: verified.agentPlatform ?? null,
    agentContextId: verified.agentContextId ?? null,
    claimedByUserId: principal.claimedByUserId,
    claimedAt: now,
    registrationIp: ctx.ip ?? null,
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditEvent("registration.created", {
    registrationId: regId,
    data: {
      registration_type: "agent-provider",
      iss: verified.iss,
      sub: verified.sub,
      agent_platform: verified.agentPlatform,
      agent_context_id: verified.agentContextId,
      match_type: principal.matchType,
    },
  });

  return {
    registration_id: regId,
    registration_type: "agent-provider",
    credential_type: cred.credentialType,
    credential: cred.credential,
    credential_expires: iso(cred.expiresAt),
    scopes,
  };
}

// User claimed · anonymous start: issue a pre-claim credential immediately.
async function registerAnonymous(
  requestedCredentialType: CredentialType,
  ctx: RequestContext
): Promise<Record<string, unknown>> {
  if (requestedCredentialType !== "api_key") {
    throw new AgentAuthError(
      "unsupported_credential_type",
      "Anonymous registration only supports the api_key credential type."
    );
  }
  enforceRateLimit("anonymous", { ip: ctx.ip });

  const regId = newId("agentRegistration");
  const userId = await createAgentUser({ name: "Agent (unclaimed)" });
  const organizationId = await createAgentOrg(
    userId,
    "Agent access (unclaimed)"
  );

  const preScopes = [...PRE_CLAIM_SCOPES];
  const postScopes = [...POST_CLAIM_SCOPES];
  const cred = await issueCredential({
    organizationId,
    credentialType: "api_key",
    scopes: preScopes,
    registrationId: regId,
    name: "Agent credential (pre-claim)",
  });

  const claimToken = newClaimToken();
  const now = new Date();
  const claimTokenExpiresAt = new Date(
    now.getTime() + REGISTRATION_TTL_SECONDS * 1000
  );

  await db.insert(agentRegistration).values({
    id: regId,
    type: "anonymous",
    status: "unclaimed",
    requestedCredentialType: "api_key",
    organizationId,
    userId,
    apiKeyId: cred.apiKeyId,
    preClaimScopes: preScopes,
    postClaimScopes: postScopes,
    claimTokenHash: sha256(claimToken),
    claimTokenExpiresAt,
    registrationIp: ctx.ip ?? null,
    createdAt: now,
    updatedAt: now,
  });

  await recordAuditEvent("registration.created", {
    registrationId: regId,
    data: { registration_type: "anonymous" },
  });

  return {
    registration_id: regId,
    registration_type: "anonymous",
    credential_type: "api_key",
    credential: cred.credential,
    credential_expires: null,
    scopes: preScopes,
    claim_url: claimUri(),
    claim_token: claimToken,
    claim_token_expires: iso(claimTokenExpiresAt),
    post_claim_scopes: postScopes,
  };
}

// User claimed · email required: email the OTP now, withhold credential.
async function registerEmailRequired(
  email: string,
  requestedCredentialType: CredentialType,
  ctx: RequestContext
): Promise<Record<string, unknown>> {
  const trimmed = email.trim();
  if (!z.string().email().safeParse(trimmed).success) {
    throw new AgentAuthError(
      "invalid_request",
      "A valid user email is required for this registration."
    );
  }
  enforceRateLimit("identity_assertion", { ip: ctx.ip });

  const regId = newId("agentRegistration");
  const claimToken = newClaimToken();
  const claimViewToken = newClaimViewToken();
  const postScopes = [...POST_CLAIM_SCOPES];
  const now = new Date();
  const claimTokenExpiresAt = new Date(
    now.getTime() + REGISTRATION_TTL_SECONDS * 1000
  );

  await db.insert(agentRegistration).values({
    id: regId,
    type: "email-verification",
    status: "unclaimed",
    requestedCredentialType,
    email: trimmed,
    postClaimScopes: postScopes,
    claimAttemptId: newId("claimAttempt"),
    claimTokenHash: sha256(claimToken),
    claimTokenExpiresAt,
    claimViewTokenHash: sha256(claimViewToken),
    registrationIp: ctx.ip ?? null,
    createdAt: now,
    updatedAt: now,
  });

  await sendClaimEmail(trimmed, claimViewUrl(claimViewToken), SERVICE_NAME);

  await recordAuditEvent("registration.created", {
    registrationId: regId,
    data: { registration_type: "email-verification" },
  });
  // Email is sent at registration for this entrypoint, so the claim is
  // implicitly requested now.
  await recordAuditEvent("claim.requested", {
    registrationId: regId,
    data: { email: trimmed },
  });

  return {
    registration_id: regId,
    registration_type: "email-verification",
    claim_url: claimUri(),
    claim_token: claimToken,
    claim_token_expires: iso(claimTokenExpiresAt),
    post_claim_scopes: postScopes,
  };
}

// ─── POST /agent/auth/claim (anonymous start only) ────────────────────────────

const claimSchema = z.object({
  claim_token: z.string().min(1),
  email: z.string().email(),
});

export async function handleClaim(
  rawBody: unknown
): Promise<Record<string, unknown>> {
  const parsed = claimSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new AgentAuthError(
      "invalid_request",
      "claim_token and a valid email are required."
    );
  }
  const { claim_token, email } = parsed.data;

  const [reg] = await db
    .select()
    .from(agentRegistration)
    .where(eq(agentRegistration.claimTokenHash, sha256(claim_token)))
    .limit(1);

  if (!reg || reg.type !== "anonymous") {
    throw new AgentAuthError("invalid_claim_token", "Unknown claim token.");
  }
  if (reg.status === "claimed") {
    throw new AgentAuthError("claimed_or_in_flight", "Already claimed.");
  }
  if (
    reg.status !== "unclaimed" ||
    (reg.claimTokenExpiresAt && reg.claimTokenExpiresAt.getTime() <= Date.now())
  ) {
    if (reg.claimTokenExpiresAt && reg.claimTokenExpiresAt.getTime() <= Date.now()) {
      await db
        .update(agentRegistration)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(agentRegistration.id, reg.id));
      throw new AgentAuthError("claim_expired", "The claim window has elapsed.");
    }
    throw new AgentAuthError("claimed_or_in_flight", "Claim is not available.");
  }

  const claimViewToken = newClaimViewToken();
  const claimAttemptId = newId("claimAttempt");
  await db
    .update(agentRegistration)
    .set({
      email,
      claimAttemptId,
      claimViewTokenHash: sha256(claimViewToken),
      updatedAt: new Date(),
    })
    .where(eq(agentRegistration.id, reg.id));

  await sendClaimEmail(email, claimViewUrl(claimViewToken), SERVICE_NAME);

  await recordAuditEvent("claim.requested", {
    registrationId: reg.id,
    data: { email },
  });

  return {
    registration_id: reg.id,
    claim_attempt_id: claimAttemptId,
    status: "initiated",
    expires_at: iso(reg.claimTokenExpiresAt),
  };
}

// ─── OTP view page support ────────────────────────────────────────────────────

export interface ClaimViewInfo {
  registrationId: string;
  serviceName: string;
  otp: string;
  email: string | null;
}

export interface ClaimViewLookup {
  serviceName: string;
  email: string | null;
}

/**
 * Read-only lookup for rendering the claim page on GET. Does NOT mint an OTP,
 * so it's safe against email link prefetchers / scanners that fetch the link
 * before the user does. Returns null if the link is unknown, already claimed,
 * or expired.
 */
export async function getClaimView(
  viewToken: string
): Promise<ClaimViewLookup | null> {
  const [reg] = await db
    .select({
      status: agentRegistration.status,
      email: agentRegistration.email,
      claimTokenExpiresAt: agentRegistration.claimTokenExpiresAt,
    })
    .from(agentRegistration)
    .where(eq(agentRegistration.claimViewTokenHash, sha256(viewToken)))
    .limit(1);

  if (!reg || reg.status !== "unclaimed") return null;
  if (reg.claimTokenExpiresAt && reg.claimTokenExpiresAt.getTime() <= Date.now()) {
    return null;
  }
  return { serviceName: SERVICE_NAME, email: reg.email };
}

/**
 * Called when the user explicitly confirms (a POST, not the GET render). Mints
 * a fresh OTP, persists only its hash, and returns the plaintext to display
 * exactly once. Gating this behind a POST means link scanners — which only
 * issue GETs — can't rotate the code out from under the user. Returns null if
 * the link is unknown, already claimed, or expired.
 */
export async function generateOtpForView(
  viewToken: string
): Promise<ClaimViewInfo | null> {
  const [reg] = await db
    .select()
    .from(agentRegistration)
    .where(eq(agentRegistration.claimViewTokenHash, sha256(viewToken)))
    .limit(1);

  if (!reg || reg.status !== "unclaimed") return null;
  if (reg.claimTokenExpiresAt && reg.claimTokenExpiresAt.getTime() <= Date.now()) {
    return null;
  }

  const otp = newOtp();
  await db
    .update(agentRegistration)
    .set({
      otpHash: sha256(otp),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      updatedAt: new Date(),
    })
    .where(eq(agentRegistration.id, reg.id));

  await recordAuditEvent("otp.generated", { registrationId: reg.id });

  return {
    registrationId: reg.id,
    serviceName: SERVICE_NAME,
    otp,
    email: reg.email,
  };
}

// ─── POST /agent/auth/claim/complete ──────────────────────────────────────────

const completeSchema = z.object({
  claim_token: z.string().min(1),
  otp: z.string().min(1),
});

export async function handleClaimComplete(
  rawBody: unknown
): Promise<Record<string, unknown>> {
  const parsed = completeSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new AgentAuthError(
      "invalid_request",
      "claim_token and otp are required."
    );
  }
  const { claim_token, otp } = parsed.data;

  const [reg] = await db
    .select()
    .from(agentRegistration)
    .where(eq(agentRegistration.claimTokenHash, sha256(claim_token)))
    .limit(1);

  if (!reg) {
    throw new AgentAuthError("invalid_claim_token", "Unknown claim token.");
  }
  if (reg.status === "claimed") {
    throw new AgentAuthError("previously_claimed", "Already claimed.");
  }
  if (
    reg.status === "expired" ||
    (reg.claimTokenExpiresAt && reg.claimTokenExpiresAt.getTime() <= Date.now())
  ) {
    throw new AgentAuthError("claim_expired", "The claim window has elapsed.");
  }
  if (!reg.otpHash || !reg.otpExpiresAt) {
    // No OTP generated yet — the user hasn't opened the claim link.
    throw new AgentAuthError("otp_invalid", "No code has been generated yet.");
  }
  if (reg.otpExpiresAt.getTime() <= Date.now()) {
    throw new AgentAuthError("otp_expired", "The code has expired.");
  }
  if (!hashesEqual(sha256(otp), reg.otpHash)) {
    throw new AgentAuthError("otp_invalid", "Incorrect code.");
  }

  if (reg.type === "anonymous") {
    return completeAnonymous(reg);
  }
  return completeEmailRequired(reg);
}

type Registration = typeof agentRegistration.$inferSelect;

// Anonymous start: bind the existing credential to a user and upgrade scopes
// in place — no token rotation.
async function completeAnonymous(
  reg: Registration
): Promise<Record<string, unknown>> {
  const email = reg.email;
  let claimedByUserId = reg.userId!;

  if (email) {
    const matched = await findUserByVerifiedEmail(email);
    if (matched && reg.organizationId) {
      // The matched human takes over the agent's org; the agent stays in it
      // as a plain member so the human sees it on their dashboard.
      await transferOwnership(reg.organizationId, matched, reg.userId!);
      claimedByUserId = matched;
    } else {
      // Promote the JIT agent user to a real, verified user. It keeps owning
      // its org — if the human signs up with this email later, account
      // linking attaches them to this very user row.
      await promoteAgentUser(reg.userId!, email);
    }
  }

  if (reg.apiKeyId) {
    await upgradeCredentialScopes(reg.apiKeyId, reg.postClaimScopes);
  }

  await db
    .update(agentRegistration)
    .set({
      status: "claimed",
      claimedByUserId,
      claimedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentRegistration.id, reg.id));

  await recordAuditEvent("claim.confirmed", {
    registrationId: reg.id,
    data: { claimed_by_user_id: claimedByUserId },
  });

  return { registration_id: reg.id, status: "claimed" };
}

// Email required: provision the agent user now and issue a fresh credential.
async function completeEmailRequired(
  reg: Registration
): Promise<Record<string, unknown>> {
  const email = reg.email!;
  const matched = await findUserByVerifiedEmail(email);

  // The agent always gets its own user row. When the email matches a human,
  // the agent joins the human's primary org as a member (with a synthetic
  // email — the real one belongs to the human); otherwise the agent user
  // carries the verified email and owns a fresh org.
  let agentUserId: string;
  let organizationId: string;
  let claimedByUserId: string;
  if (matched) {
    organizationId = await findOrCreatePrimaryOrg(matched);
    agentUserId = await createAgentUser({ name: "Agent (claimed)" });
    await ensureMember(organizationId, agentUserId, "member");
    claimedByUserId = matched;
  } else {
    agentUserId = await createAgentUser({
      email,
      emailVerified: true,
      name: "Agent (claimed)",
    });
    organizationId = await createAgentOrg(agentUserId);
    claimedByUserId = agentUserId;
  }

  const cred = await issueCredential({
    organizationId,
    credentialType: reg.requestedCredentialType,
    scopes: reg.postClaimScopes,
    registrationId: reg.id,
    name: "Agent credential",
  });

  await db
    .update(agentRegistration)
    .set({
      status: "claimed",
      organizationId,
      userId: agentUserId,
      apiKeyId: cred.apiKeyId,
      claimedByUserId,
      claimedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentRegistration.id, reg.id));

  await recordAuditEvent("claim.confirmed", {
    registrationId: reg.id,
    data: { claimed_by_user_id: claimedByUserId },
  });

  return {
    registration_id: reg.id,
    status: "claimed",
    credential_type: cred.credentialType,
    credential: cred.credential,
    credential_expires: iso(cred.expiresAt),
    scopes: cred.scopes,
  };
}

// ─── POST /agent/auth/revoke ──────────────────────────────────────────────────

export async function handleRevoke(rawToken: string): Promise<void> {
  const verified = await verifyLogoutToken(rawToken, buildVerifyDeps());

  // Spec keys revocation on (iss, sub, aud). agtls is a single auth server,
  // so every registration shares the same aud; matching on (iss, sub) alone is
  // a deliberate, strictly-more-aggressive simplification (revokes all of this
  // subject's delegations from this issuer).
  const regs = await db
    .select({ id: agentRegistration.id })
    .from(agentRegistration)
    .where(
      and(
        eq(agentRegistration.iss, verified.iss),
        eq(agentRegistration.sub, verified.sub)
      )
    );
  const ids = regs.map((r) => r.id);

  await revokeCredentialsForRegistrations(ids);
  if (ids.length > 0) {
    await db
      .update(agentRegistration)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(inArray(agentRegistration.id, ids));
  }

  await recordAuditEvent("registration.revoked", {
    data: { iss: verified.iss, sub: verified.sub, count: ids.length },
  });
}

// ─── Maintenance: expire stale registrations ──────────────────────────────────
//
// Not scheduled in this implementation — wire this to a cron / queue job. It
// revokes pre-claim credentials and marks unclaimed registrations expired once
// their TTL elapses.
export async function expireStaleRegistrations(): Promise<number> {
  const now = new Date();
  const stale = await db
    .select()
    .from(agentRegistration)
    .where(eq(agentRegistration.status, "unclaimed"));

  const expired = stale.filter(
    (r) => r.claimTokenExpiresAt && r.claimTokenExpiresAt.getTime() <= now.getTime()
  );
  if (expired.length === 0) return 0;

  const ids = expired.map((r) => r.id);
  await revokeCredentialsForRegistrations(ids);
  await db
    .update(agentRegistration)
    .set({ status: "expired", updatedAt: now })
    .where(inArray(agentRegistration.id, ids));

  for (const r of expired) {
    await recordAuditEvent("registration.expired", { registrationId: r.id });
  }
  return expired.length;
}
