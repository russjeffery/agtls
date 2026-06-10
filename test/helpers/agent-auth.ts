import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { setPublicKey } from "./jwks-key";
import { _resetTrustListCache } from "@/lib/agent-auth/trusted-providers";

// In-memory trusted provider used by the agent-verified (ID-JAG) tests. Mirrors
// test/scripts/agent-auth-smoke.ts, but wires the keypair into the mocked JWKS
// module and the trust list env so the full service/route path runs offline.

export const TEST_ISS = "https://provider.example.com";
export const TEST_AUD = "https://app.example.com/"; // = expectedAudience()
export const TEST_CLIENT = "https://provider.example.com/client";
export const REVOKED_EVENT =
  "https://schemas.workos.com/events/agent/auth/identity/assertion/revoked";

let keys: { publicKey: CryptoKey; privateKey: CryptoKey } | null = null;
let otherKey: CryptoKey | null = null; // a non-trusted key, for bad-signature tests
let jtiSeq = 0;

async function ensureKeys() {
  if (!keys) {
    keys = (await generateKeyPair("ES256")) as {
      publicKey: CryptoKey;
      privateKey: CryptoKey;
    };
    otherKey = (await generateKeyPair("ES256")).privateKey as CryptoKey;
  }
  return keys;
}

/**
 * Register the in-memory provider as trusted and install its public key into
 * the mocked JWKS resolver. Call inside a test (after beforeEach has cleared
 * the trust list) before minting/verifying ID-JAGs.
 */
export async function useTrustedProvider(
  opts: { clientId?: string } = {}
): Promise<void> {
  const { publicKey } = await ensureKeys();
  setPublicKey(publicKey);
  process.env.AGENT_AUTH_TRUSTED_PROVIDERS = JSON.stringify([
    { iss: TEST_ISS, name: "Test Provider", ...(opts.clientId ? { clientId: opts.clientId } : {}) },
  ]);
  _resetTrustListCache();
}

export async function publicJwk() {
  const { publicKey } = await ensureKeys();
  return exportJWK(publicKey);
}

export interface MintOptions {
  typ?: string;
  iss?: string;
  aud?: string;
  /** Sign with the untrusted key to force a signature failure. */
  useWrongKey?: boolean;
  expSec?: number;
  iatSec?: number;
  jti?: string;
  claims?: Record<string, unknown>;
}

/** Mint an ID-JAG (oauth-id-jag+jwt). Defaults to a valid, verifiable token. */
export async function mintIdJag(opts: MintOptions = {}): Promise<string> {
  const { privateKey } = await ensureKeys();
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    sub: "user-123",
    client_id: TEST_CLIENT,
    email: "user@example.com",
    email_verified: true,
    agent_platform: "test-agent",
    agent_context_id: "ctx-1",
    ...opts.claims,
  };
  return new SignJWT(payload)
    .setProtectedHeader({
      alg: "ES256",
      typ: opts.typ ?? "oauth-id-jag+jwt",
      kid: "k1",
    })
    .setIssuer(opts.iss ?? TEST_ISS)
    .setAudience(opts.aud ?? TEST_AUD)
    .setIssuedAt(opts.iatSec ?? now)
    .setExpirationTime(opts.expSec ?? now + 300)
    .setJti(opts.jti ?? `jti-${jtiSeq++}`)
    .sign(opts.useWrongKey ? otherKey! : privateKey);
}

/** Mint a back-channel logout token (logout+jwt) carrying the revoke event. */
export async function mintLogoutToken(
  opts: { sub?: string; iss?: string; events?: Record<string, unknown>; jti?: string } = {}
): Promise<string> {
  const { privateKey } = await ensureKeys();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ events: opts.events ?? { [REVOKED_EVENT]: {} } })
    .setProtectedHeader({ alg: "ES256", typ: "logout+jwt", kid: "k1" })
    .setIssuer(opts.iss ?? TEST_ISS)
    .setSubject(opts.sub ?? "user-123")
    .setAudience(TEST_AUD)
    .setIssuedAt(now)
    .setJti(opts.jti ?? `logout-${jtiSeq++}`)
    .sign(privateKey);
}
