/**
 * Unit tests for src/lib/agent-auth/idjag.ts
 *
 * All side effects are injected — no network, no DB. We construct VerifyDeps
 * with an in-memory ES256 keypair, mirroring scripts/agent-auth-smoke.ts.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import {
  verifyIdJag,
  verifyLogoutToken,
  type VerifyDeps,
} from "@/lib/agent-auth/idjag";
import { AgentAuthError } from "@/lib/agent-auth/errors";

const ISS = "https://provider.example.com";
const AUD = "https://app.example.com/";
const CLIENT = "https://provider.example.com/client";
const REVOKED_EVENT =
  "https://schemas.workos.com/events/agent/auth/identity/assertion/revoked";

// Keypairs are shared across the whole module — generated once.
let privateKey: CryptoKey;
let publicKey: CryptoKey;
let otherPrivateKey: CryptoKey;

let jtiSeq = 0;

// JTI replay state — reset between tests
let seen: Set<string>;

function makeDeps(overrides: Partial<VerifyDeps> = {}): VerifyDeps {
  return {
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
    ...overrides,
  };
}

function mint(
  opts: {
    typ?: string;
    iss?: string;
    aud?: string;
    key?: CryptoKey;
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
    .setJti(opts.jti ?? `jti-${jtiSeq++}`)
    .sign(opts.key ?? privateKey);
}

function mintLogout(
  opts: {
    events?: Record<string, unknown>;
    sub?: string;
    jti?: string;
    includeJti?: boolean;
    includeSub?: boolean;
  } = {}
) {
  const now = Math.floor(Date.now() / 1000);
  const builder = new SignJWT({
    events: opts.events ?? { [REVOKED_EVENT]: {} },
  })
    .setProtectedHeader({ alg: "ES256", typ: "logout+jwt", kid: "k1" })
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt(now);

  const includeSub = opts.includeSub !== false;
  const includeJti = opts.includeJti !== false;

  if (includeSub) builder.setSubject(opts.sub ?? "user-123");
  if (includeJti) builder.setJti(opts.jti ?? `logout-${jtiSeq++}`);

  return builder.sign(privateKey);
}

// ─── Setup ─────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Generate fresh keypairs once (idempotent within module)
  if (!privateKey) {
    const kp = await generateKeyPair("ES256");
    privateKey = kp.privateKey as CryptoKey;
    publicKey = kp.publicKey as CryptoKey;
    const kp2 = await generateKeyPair("ES256");
    otherPrivateKey = kp2.privateKey as CryptoKey;
  }
  // Fresh replay set per test
  seen = new Set();
});

// ─── verifyIdJag ───────────────────────────────────────────────────────────

describe("verifyIdJag – happy path", () => {
  it("returns iss/sub/aud/clientId/emailVerified/agentPlatform/agentContextId", async () => {
    const deps = makeDeps();
    const token = await mint({ jti: "happy-1" });
    const v = await verifyIdJag(token, deps);

    expect(v.iss).toBe(ISS);
    expect(v.sub).toBe("user-123");
    expect(v.aud).toBe(AUD);
    expect(v.clientId).toBe(CLIENT);
    expect(v.emailVerified).toBe(true);
    expect(v.agentPlatform).toBe("test-agent");
    expect(v.agentContextId).toBe("ctx-1");
  });

  it("returns jti, iat, exp as numbers", async () => {
    const deps = makeDeps();
    const token = await mint({ jti: "happy-2" });
    const v = await verifyIdJag(token, deps);

    expect(typeof v.jti).toBe("string");
    expect(v.jti).toBe("happy-2");
    expect(typeof v.iat).toBe("number");
    expect(typeof v.exp).toBe("number");
    expect(v.exp).toBeGreaterThan(v.iat);
  });

  it("includes email field when present", async () => {
    const deps = makeDeps();
    const token = await mint({ jti: "happy-3" });
    const v = await verifyIdJag(token, deps);
    expect(v.email).toBe("user@example.com");
  });
});

describe("verifyIdJag – replay_detected", () => {
  it("rejects a JTI used a second time", async () => {
    const deps = makeDeps();
    const token = await mint({ jti: "replay-test" });

    // First use succeeds
    await expect(verifyIdJag(token, deps)).resolves.toBeDefined();

    // Second use fails
    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "replay_detected",
    });
  });

  it("does not burn a JTI on earlier validation failures", async () => {
    // expired token — markJtiSeen should NOT be called
    const deps = makeDeps();
    const past = Math.floor(Date.now() / 1000) - 1000;
    const jti = "no-burn-jti";
    const token = await mint({ jti, iatSec: past - 300, expSec: past });

    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "expired",
    });
    // JTI should not be in the seen set (was never passed to markJtiSeen)
    expect(seen.has(jti)).toBe(false);
  });
});

describe("verifyIdJag – invalid_issuer", () => {
  it("rejects an untrusted issuer", async () => {
    const deps = makeDeps();
    const token = await mint({ iss: "https://evil.example.com" });

    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "invalid_issuer",
    });
  });
});

describe("verifyIdJag – invalid_audience", () => {
  it("rejects a token with the wrong audience", async () => {
    const deps = makeDeps();
    const token = await mint({ aud: "https://other.example.com/" });

    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "invalid_audience",
    });
  });
});

describe("verifyIdJag – invalid_signature", () => {
  it("rejects a token signed with a different key", async () => {
    const deps = makeDeps();
    const token = await mint({ key: otherPrivateKey });

    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "invalid_signature",
    });
  });

  it("rejects a token with the wrong typ header", async () => {
    const deps = makeDeps();
    const token = await mint({ typ: "JWT" });

    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "invalid_signature",
    });
  });

  it("rejects a malformed (non-JWT) token", async () => {
    const deps = makeDeps();

    await expect(verifyIdJag("not.a.token", deps)).rejects.toMatchObject({
      code: "invalid_signature",
    });
  });

  it("rejects a token with missing jti", async () => {
    const deps = makeDeps();
    const now = Math.floor(Date.now() / 1000);
    // Build token without setJti
    const token = await new SignJWT({
      sub: "user-123",
      client_id: CLIENT,
      email: "user@example.com",
      email_verified: true,
    })
      .setProtectedHeader({ alg: "ES256", typ: "oauth-id-jag+jwt", kid: "k1" })
      .setIssuer(ISS)
      .setAudience(AUD)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey);

    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "invalid_signature",
    });
  });
});

describe("verifyIdJag – expired", () => {
  it("rejects a token whose exp is in the past (beyond clock tolerance)", async () => {
    const deps = makeDeps();
    const past = Math.floor(Date.now() / 1000) - 1000;
    const token = await mint({ iatSec: past - 300, expSec: past });

    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "expired",
    });
  });

  it("rejects a token with iat unreasonably far in the future", async () => {
    const deps = makeDeps();
    const futureIat = Math.floor(Date.now() / 1000) + 10000; // 10000s in future
    const token = await mint({ iatSec: futureIat, expSec: futureIat + 300 });

    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "expired",
    });
  });
});

describe("verifyIdJag – invalid_client_id", () => {
  it("rejects when client_id claim is missing", async () => {
    const deps = makeDeps();
    const token = await mint({
      claims: { client_id: undefined },
    });

    // client_id missing → invalid_client_id
    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "invalid_client_id",
    });
  });

  it("rejects when provider pins a clientId and it does not match", async () => {
    const deps = makeDeps({
      resolveProvider: (iss) =>
        iss === ISS
          ? { iss: ISS, name: "Test Provider", clientId: "https://expected.client.com" }
          : undefined,
    });
    const token = await mint(); // uses CLIENT which != expected

    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "invalid_client_id",
    });
  });

  it("accepts when provider does not pin a clientId", async () => {
    const deps = makeDeps({
      resolveProvider: (iss) =>
        iss === ISS ? { iss: ISS, name: "Test Provider" } : undefined,
    });
    const token = await mint();

    await expect(verifyIdJag(token, deps)).resolves.toBeDefined();
  });
});

describe("verifyIdJag – missing_verified_email", () => {
  it("rejects when both email_verified and phone_number_verified are false", async () => {
    const deps = makeDeps();
    const token = await mint({
      claims: { email_verified: false, phone_number_verified: false },
    });

    await expect(verifyIdJag(token, deps)).rejects.toMatchObject({
      code: "missing_verified_email",
    });
  });

  it("accepts when only phone_number_verified is true (no verified email)", async () => {
    const deps = makeDeps();
    const token = await mint({
      claims: {
        email_verified: false,
        phone_number: "+15555550100",
        phone_number_verified: true,
      },
    });

    const v = await verifyIdJag(token, deps);
    expect(v.emailVerified).toBe(false);
    expect(v.phoneNumberVerified).toBe(true);
  });
});

// ─── verifyLogoutToken ──────────────────────────────────────────────────────

describe("verifyLogoutToken – happy path", () => {
  it("returns sub from a valid logout token", async () => {
    const deps = makeDeps();
    const token = await mintLogout();
    const lt = await verifyLogoutToken(token, deps);

    expect(lt.sub).toBe("user-123");
    expect(lt.iss).toBe(ISS);
    expect(typeof lt.jti).toBe("string");
    expect(lt.jti.length).toBeGreaterThan(0);
  });
});

describe("verifyLogoutToken – invalid_signature", () => {
  it("rejects logout token missing the revoke event", async () => {
    const deps = makeDeps();
    const token = await mintLogout({ events: {} });

    await expect(verifyLogoutToken(token, deps)).rejects.toMatchObject({
      code: "invalid_signature",
    });
  });

  it("rejects logout token with a non-revoke event", async () => {
    const deps = makeDeps();
    const token = await mintLogout({
      events: { "https://other.event.com/": {} },
    });

    await expect(verifyLogoutToken(token, deps)).rejects.toMatchObject({
      code: "invalid_signature",
    });
  });

  it("rejects logout token missing sub", async () => {
    const deps = makeDeps();
    // Build without setSubject
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ events: { [REVOKED_EVENT]: {} } })
      .setProtectedHeader({ alg: "ES256", typ: "logout+jwt", kid: "k1" })
      .setIssuer(ISS)
      .setAudience(AUD)
      .setIssuedAt(now)
      .setJti(`logout-nosub-${jtiSeq++}`)
      .sign(privateKey);

    await expect(verifyLogoutToken(token, deps)).rejects.toMatchObject({
      code: "invalid_signature",
    });
  });

  it("rejects logout token missing jti", async () => {
    const deps = makeDeps();
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ events: { [REVOKED_EVENT]: {} } })
      .setProtectedHeader({ alg: "ES256", typ: "logout+jwt", kid: "k1" })
      .setIssuer(ISS)
      .setAudience(AUD)
      .setIssuedAt(now)
      .setSubject("user-123")
      .sign(privateKey);

    await expect(verifyLogoutToken(token, deps)).rejects.toMatchObject({
      code: "invalid_signature",
    });
  });
});

describe("verifyLogoutToken – replay_detected", () => {
  it("rejects a logout token used a second time", async () => {
    const deps = makeDeps();
    const token = await mintLogout({ jti: "logout-replay" });

    await expect(verifyLogoutToken(token, deps)).resolves.toBeDefined();
    await expect(verifyLogoutToken(token, deps)).rejects.toMatchObject({
      code: "replay_detected",
    });
  });
});
