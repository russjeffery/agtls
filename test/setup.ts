import { beforeAll, beforeEach, vi } from "vitest";

// ─── Environment ──────────────────────────────────────────────────────────────
// Set before any app module is imported so config derivation (discovery URLs,
// audiences) is deterministic. A dummy DATABASE_URL keeps any incidental import
// of the real driver from throwing; the db module itself is mocked below.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
process.env.BETTER_AUTH_URL = "https://app.example.com";
process.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-for-anything-real";

// ─── Database stub ────────────────────────────────────────────────────────────
// Point every `import { db } from "@/lib/db"` at the shared PGlite instance, and
// re-export the real schema so `import { task } from "@/lib/db"` keeps working.
vi.mock("@/lib/db", async () => {
  const schema = await vi.importActual<typeof import("@/lib/db/schema")>(
    "@/lib/db/schema"
  );
  const { testDb } = await import("./helpers/db");
  return { db: testDb, ...schema };
});

// ─── JWKS stub ────────────────────────────────────────────────────────────────
// The agent-verified flow verifies ID-JAGs against a provider's remote JWKS.
// Replace that network fetch with the in-memory test keypair (set by the
// agent-auth helper) so the full register/revoke path runs offline.
vi.mock("@/lib/agent-auth/jwks", async () => {
  const holder = await import("./helpers/jwks-key");
  return {
    getRemoteKeySet: () => async () => {
      const key = holder.getPublicKey();
      if (!key) throw new Error("test JWKS key not configured — call useTrustedProvider()");
      return key;
    },
    _resetJwksCache: () => {},
  };
});

// ─── next/headers stub ────────────────────────────────────────────────────────
// Session-guarded routes (projects, keys) call `await headers()`, which throws
// outside a real request scope. Return an empty Headers; session presence is
// controlled separately by spying on betterAuth.api.getSession (see
// test/helpers/session.ts).
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));

import { migrate, resetDb } from "./helpers/db";
import { resetEmails } from "./helpers/email";
import { setPublicKey } from "./helpers/jwks-key";

beforeAll(async () => {
  await migrate();
});

beforeEach(async () => {
  // Clear vi.spyOn spies (e.g. the session spy) between tests. Module-level
  // vi.mock factories (db, jwks, email, next/headers) are not affected.
  vi.restoreAllMocks();

  await resetDb();
  resetEmails();

  // Reset in-process caches/limiters that would otherwise leak across tests.
  const [{ _resetRateLimit }, { _resetTrustListCache }, { _resetJwksCache }] =
    await Promise.all([
      import("@/lib/agent-auth/rate-limit"),
      import("@/lib/agent-auth/trusted-providers"),
      import("@/lib/agent-auth/jwks"),
    ]);
  _resetRateLimit();
  _resetTrustListCache();
  _resetJwksCache();

  // Default to no trusted providers / no JWKS key; tests that exercise the
  // agent-verified flow opt in via test/helpers/agent-auth.ts.
  delete process.env.AGENT_AUTH_TRUSTED_PROVIDERS;
  setPublicKey(null);
});
