import { eq, inArray, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKey } from "@/lib/db/schema";
import { newApiKey, newId } from "@/lib/api/ids";
import { hashApiKey } from "@/lib/api/middleware";
import { ACCESS_TOKEN_TTL_SECONDS, type CredentialType } from "./config";

export interface IssuedCredential {
  apiKeyId: string;
  /** Plaintext credential — returned to the caller exactly once. */
  credential: string;
  credentialType: CredentialType;
  expiresAt: Date | null;
  scopes: string[];
}

/**
 * Issue a credential of the requested type. agtls represents both
 * `api_key` and `access_token` as `agt_*` keys (resolveAuth keys off the
 * prefix); access tokens additionally carry an expiry. Because agtls has no
 * refresh tokens, the spec's "no refresh token from ID-JAG" rule is satisfied
 * automatically.
 */
export async function issueCredential(opts: {
  organizationId: string;
  credentialType: CredentialType;
  scopes: string[];
  registrationId: string;
  name?: string;
}): Promise<IssuedCredential> {
  const raw = newApiKey();
  const expiresAt =
    opts.credentialType === "access_token"
      ? new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000)
      : null;
  const id = newId("apiKey");
  await db.insert(apiKey).values({
    id,
    organizationId: opts.organizationId,
    name: opts.name ?? "Agent credential",
    keyPrefix: raw.slice(0, 20),
    keyHash: hashApiKey(raw),
    scopes: opts.scopes,
    expiresAt,
    createdByAgent: true,
    agentRegistrationId: opts.registrationId,
    createdAt: new Date(),
  });
  return {
    apiKeyId: id,
    credential: raw,
    credentialType: opts.credentialType,
    expiresAt,
    scopes: opts.scopes,
  };
}

/**
 * Anonymous-start claim: upgrade an existing key's scopes in place (no
 * rotation). Agents keep the same key. The trade-off — anyone who captured the
 * key pre-claim retains access post-claim — is documented; forced rotation is
 * a deferred opt-in.
 */
export async function upgradeCredentialScopes(
  apiKeyId: string,
  scopes: string[]
): Promise<void> {
  await db.update(apiKey).set({ scopes }).where(eq(apiKey.id, apiKeyId));
}

/** Revoke every active credential tied to the given registrations. */
export async function revokeCredentialsForRegistrations(
  registrationIds: string[]
): Promise<number> {
  if (registrationIds.length === 0) return 0;
  const revoked = await db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(
      and(
        inArray(apiKey.agentRegistrationId, registrationIds),
        isNull(apiKey.revokedAt)
      )
    )
    .returning({ id: apiKey.id });
  return revoked.length;
}
