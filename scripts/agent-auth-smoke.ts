/**
 * Smoke test for the pure agent-auth verification logic. No DB, no network:
 * an in-memory keypair stands in for a trusted provider's JWKS, dependencies
 * are injected, and we mint ID-JAGs / logout tokens and assert verifier
 * behaviour on the happy path and key rejection paths.
 *
 *   npx tsx scripts/agent-auth-smoke.ts
 */
import { generateKeyPair, SignJWT } from "jose";
import {
  verifyIdJag,
  verifyLogoutToken,
  type VerifyDeps,
} from "../src/lib/agent-auth/idjag";
import { AgentAuthError } from "../src/lib/agent-auth/errors";
import {
  newClaimToken,
  newClaimViewToken,
  newOtp,
  sha256,
  hashesEqual,
} from "../src/lib/agent-auth/tokens";

const ISS = "https://provider.example.com";
const AUD = "https://app.example.com/";
const CLIENT = "https://provider.example.com/client";
const REVOKED_EVENT =
  "https://schemas.workos.com/events/agent/auth/identity/assertion/revoked";

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`  ✓ ${name}`);
}
function bad(name: string, detail: string) {
  failed++;
  console.error(`  ✗ ${name} — ${detail}`);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail || "assertion failed");
}
async function expectError(
  name: string,
  code: string,
  fn: () => Promise<unknown>
) {
  try {
    await fn();
    bad(name, `expected AgentAuthError '${code}', got success`);
  } catch (err) {
    if (err instanceof AgentAuthError && err.code === code) ok(name);
    else
      bad(
        name,
        `expected '${code}', got ${
          err instanceof AgentAuthError ? `'${err.code}'` : String(err)
        }`
      );
  }
}

async function main() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const { privateKey: otherKey } = await generateKeyPair("ES256");

  const seen = new Set<string>();
  const deps: VerifyDeps = {
    expectedAudience: AUD,
    resolveProvider: (iss) =>
      iss === ISS ? { iss: ISS, name: "Test Provider" } : undefined,
    jwksUriFor: (p) => `${p.iss}/.well-known/jwks.json`,
    getKeySet: () => async () => publicKey,
    markJtiSeen: async (jti) => {
      if (seen.has(jti)) return false;
      seen.add(jti);
      return true;
    },
    clockToleranceSec: 90,
  };

  let jtiCounter = 0;
  function mint(
    opts: {
      typ?: string;
      iss?: string;
      aud?: string;
      key?: typeof privateKey;
      expSec?: number;
      iatSec?: number;
      jti?: string;
      claims?: Record<string, unknown>;
    } = {}
  ) {
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = {
      sub: "user-123",
      client_id: CLIENT,
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
      .setIssuer(opts.iss ?? ISS)
      .setAudience(opts.aud ?? AUD)
      .setIssuedAt(opts.iatSec ?? now)
      .setExpirationTime(opts.expSec ?? now + 300)
      .setJti(opts.jti ?? `jti-${jtiCounter++}`)
      .sign(opts.key ?? privateKey);
  }

  console.log("ID-JAG verification:");

  // Happy path
  const v = await verifyIdJag(await mint({ jti: "happy" }), deps);
  assert("happy path returns issuer", v.iss === ISS, v.iss);
  assert("happy path returns subject", v.sub === "user-123", v.sub);
  assert("happy path email verified", v.emailVerified === true);
  assert(
    "happy path carries provider correlation",
    v.agentPlatform === "test-agent" && v.agentContextId === "ctx-1"
  );

  // Replay: same jti twice
  const replayToken = await mint({ jti: "replay" });
  await verifyIdJag(replayToken, deps);
  await expectError("replayed assertion rejected", "replay_detected", async () =>
    verifyIdJag(replayToken, deps)
  );

  // Untrusted issuer
  await expectError("untrusted issuer rejected", "invalid_issuer", async () =>
    verifyIdJag(await mint({ iss: "https://evil.example.com" }), deps)
  );

  // Wrong audience
  await expectError("wrong audience rejected", "invalid_audience", async () =>
    verifyIdJag(await mint({ aud: "https://other.example.com/" }), deps)
  );

  // Bad signature (signed with a different key)
  await expectError("bad signature rejected", "invalid_signature", async () =>
    verifyIdJag(await mint({ key: otherKey }), deps)
  );

  // Expired
  const past = Math.floor(Date.now() / 1000) - 1000;
  await expectError("expired assertion rejected", "expired", async () =>
    verifyIdJag(await mint({ iatSec: past - 300, expSec: past }), deps)
  );

  // No verified email or phone
  await expectError(
    "missing verified contact rejected",
    "missing_verified_email",
    async () =>
      verifyIdJag(
        await mint({
          claims: { email_verified: false, phone_number_verified: false },
        }),
        deps
      )
  );

  // Wrong typ header
  await expectError("wrong typ rejected", "invalid_signature", async () =>
    verifyIdJag(await mint({ typ: "JWT" }), deps)
  );

  console.log("\nLogout token verification:");

  function mintLogout(opts: { events?: Record<string, unknown> } = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      events: opts.events ?? { [REVOKED_EVENT]: {} },
    })
      .setProtectedHeader({ alg: "ES256", typ: "logout+jwt", kid: "k1" })
      .setIssuer(ISS)
      .setSubject("user-123")
      .setAudience(AUD)
      .setIssuedAt(now)
      .setJti(`logout-${jtiCounter++}`)
      .sign(privateKey);
  }

  const lt = await verifyLogoutToken(await mintLogout(), deps);
  assert("logout token returns subject", lt.sub === "user-123", lt.sub);

  await expectError("logout without revoke event rejected", "invalid_signature", async () =>
    verifyLogoutToken(await mintLogout({ events: {} }), deps)
  );

  console.log("\nToken helpers:");
  assert("claim token prefix", newClaimToken().startsWith("clm_"));
  assert("claim token length", newClaimToken().length === 4 + 25);
  assert("view token prefix", newClaimViewToken().startsWith("cvt_"));
  const otp = newOtp();
  assert("otp is 6 digits", /^\d{6}$/.test(otp), otp);
  assert(
    "sha256 stable + equal",
    hashesEqual(sha256("x"), sha256("x")) && !hashesEqual(sha256("x"), sha256("y"))
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
