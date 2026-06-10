/**
 * End-to-end manual smoke test for the ID-JAG agent-auth flow against a
 * running dev server. Serves its own JWKS endpoint so no external provider is
 * needed.
 *
 * First run (no .env.local config yet):
 *   npx tsx test/scripts/manual-idjag-test.ts
 *   → Generates a stable keypair, updates .env.local, and asks you to restart
 *     the dev server.
 *
 * After restarting:
 *   npx tsx test/scripts/manual-idjag-test.ts
 *   → Runs: ID-JAG registration → MCP call → back-channel revoke → verify dead.
 *
 * Options:
 *   BASE_URL=http://localhost:3000   (env) override the target server
 *   JWKS_PORT=9999                  (env) override the local JWKS server port
 */

import { createServer } from "http";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  generateKeyPair,
  exportJWK,
  importJWK,
  SignJWT,
} from "jose";
import { randomUUID } from "crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEYS_FILE = resolve(ROOT, ".test-idjag-keys.json");
const ENV_FILE = resolve(ROOT, ".env.local");
const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const JWKS_PORT = parseInt(process.env.JWKS_PORT ?? "9999", 10);

const ISS = `http://localhost:${JWKS_PORT}`;
const KID = "k1";
const SUB = "test-user-idjag";
const CLIENT_ID = `${ISS}/client`;
const PROVIDER_ENTRY = JSON.stringify([{ iss: ISS, name: "Local test provider (manual-idjag-test)" }]);

// ─── Output helpers ────────────────────────────────────────────────────────────

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
async function check(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
    ok(name);
  } catch (err) {
    bad(name, err instanceof Error ? err.message : String(err));
  }
}

// ─── Keypair persistence ───────────────────────────────────────────────────────

interface StoredKeys {
  privateKeyJwk: Record<string, unknown>;
  publicKeyJwk: Record<string, unknown>;
}

async function loadOrGenerateKeys(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey; publicKeyJwk: Record<string, unknown> }> {
  if (existsSync(KEYS_FILE)) {
    const stored: StoredKeys = JSON.parse(await readFile(KEYS_FILE, "utf-8"));
    const privateKey = (await importJWK(stored.privateKeyJwk as Parameters<typeof importJWK>[0], "ES256")) as CryptoKey;
    const publicKey = (await importJWK(stored.publicKeyJwk as Parameters<typeof importJWK>[0], "ES256")) as CryptoKey;
    return { privateKey, publicKey, publicKeyJwk: stored.publicKeyJwk };
  }

  console.log("  Generating new ES256 keypair → .test-idjag-keys.json");
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const privateKeyJwk = { ...(await exportJWK(privateKey)), kid: KID, alg: "ES256" };
  const publicKeyJwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "ES256", use: "sig" };
  await writeFile(KEYS_FILE, JSON.stringify({ privateKeyJwk, publicKeyJwk }, null, 2));
  return { privateKey, publicKey, publicKeyJwk };
}

// ─── JWKS HTTP server ──────────────────────────────────────────────────────────

function startJwksServer(publicKeyJwk: Record<string, unknown>): Promise<{ stop: () => void }> {
  const jwksBody = JSON.stringify({ keys: [publicKeyJwk] });
  return new Promise((res, rej) => {
    const server = createServer((req, resp) => {
      if (req.url === "/.well-known/jwks.json") {
        resp.writeHead(200, { "Content-Type": "application/json" });
        resp.end(jwksBody);
      } else {
        resp.writeHead(404);
        resp.end();
      }
    });
    server.on("error", rej);
    server.listen(JWKS_PORT, "127.0.0.1", () => {
      console.log(`  JWKS server → http://localhost:${JWKS_PORT}/.well-known/jwks.json`);
      res({ stop: () => server.close() });
    });
  });
}

// ─── .env.local check ─────────────────────────────────────────────────────────

async function ensureEnvConfig(): Promise<boolean> {
  let env = existsSync(ENV_FILE) ? await readFile(ENV_FILE, "utf-8") : "";

  if (env.includes(`"iss":"${ISS}"`) || env.includes(`"iss": "${ISS}"`)) {
    return true; // already configured
  }

  // Remove any existing AGENT_AUTH_TRUSTED_PROVIDERS line(s)
  env = env.replace(/^AGENT_AUTH_TRUSTED_PROVIDERS=.*$/gm, "").trimEnd();
  env += `\nAGENT_AUTH_TRUSTED_PROVIDERS='${PROVIDER_ENTRY}'\n`;
  await writeFile(ENV_FILE, env);

  console.log("\n  ⚠  .env.local updated with AGENT_AUTH_TRUSTED_PROVIDERS.");
  console.log("     Restart your dev server (npm run dev) then re-run this script.\n");
  return false;
}

// ─── JWT helpers ───────────────────────────────────────────────────────────────

async function mintIdJag(privateKey: CryptoKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: SUB,
    client_id: CLIENT_ID,
    email: "test@example.com",
    email_verified: true,
    agent_platform: "manual-test",
    agent_context_id: "ctx-manual",
  })
    .setProtectedHeader({ alg: "ES256", typ: "oauth-id-jag+jwt", kid: KID })
    .setIssuer(ISS)
    .setAudience(`${BASE_URL}/`)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(randomUUID())
    .sign(privateKey);
}

async function mintLogoutToken(privateKey: CryptoKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const REVOKED_EVENT = "https://schemas.workos.com/events/agent/auth/identity/assertion/revoked";
  return new SignJWT({ events: { [REVOKED_EVENT]: {} } })
    .setProtectedHeader({ alg: "ES256", typ: "logout+jwt", kid: KID })
    .setIssuer(ISS)
    .setSubject(SUB)
    .setAudience(`${BASE_URL}/`)
    .setIssuedAt(now)
    .setJti(randomUUID())
    .sign(privateKey);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nManual ID-JAG smoke test → ${BASE_URL}\n`);

  const { privateKey, publicKeyJwk } = await loadOrGenerateKeys();

  let jwks: { stop: () => void };
  try {
    jwks = await startJwksServer(publicKeyJwk);
  } catch (err) {
    console.error(`\nFailed to start JWKS server on port ${JWKS_PORT}: ${err}`);
    console.error("Try a different port with JWKS_PORT=<port> npx tsx test/scripts/manual-idjag-test.ts");
    process.exit(1);
  }

  try {
    const ready = await ensureEnvConfig();
    if (!ready) {
      jwks.stop();
      process.exit(0);
    }

    // Check server is reachable
    let token: string | undefined;

    console.log("\n  Registration\n");

    await check("POST /api/agent/auth returns 201 + token", async () => {
      const assertion = await mintIdJag(privateKey);
      const res = await fetch(`${BASE_URL}/api/agent/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "identity_assertion",
          assertion_type: "urn:ietf:params:oauth:token-type:id-jag",
          assertion,
          requested_credential_type: "api_key",
        }),
      });
      if (res.status !== 201) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
      const data = (await res.json()) as { access_token?: string; api_key?: string };
      token = data.api_key ?? data.access_token;
      if (!token?.startsWith("agt_")) throw new Error(`No agt_ token in response: ${JSON.stringify(data)}`);
    });

    if (!token) {
      console.error("\n  Skipping MCP + revoke tests — no token obtained.\n");
      process.exit(1);
    }

    console.log("\n  MCP access\n");

    await check("POST /api/mcp with valid token returns non-401", async () => {
      const res = await fetch(`${BASE_URL}/api/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "manual-idjag-test", version: "0.0.0" },
          },
        }),
      });
      if (res.status === 401) throw new Error("Received 401 — token not accepted");
    });

    await check("POST /api/mcp without token returns 401", async () => {
      const res = await fetch(`${BASE_URL}/api/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} }),
      });
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    console.log("\n  Back-channel revocation\n");

    await check("POST /api/agent/auth/revoke returns 200", async () => {
      const logoutToken = await mintLogoutToken(privateKey);
      const res = await fetch(`${BASE_URL}/api/agent/auth/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/logout+jwt" },
        body: logoutToken,
      });
      if (res.status !== 200) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }
    });

    await check("Revoked token rejected by /api/mcp (401)", async () => {
      const res = await fetch(`${BASE_URL}/api/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "initialize", params: {} }),
      });
      if (res.status !== 401) throw new Error(`Expected 401 after revocation, got ${res.status}`);
    });
  } finally {
    jwks.stop();
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
