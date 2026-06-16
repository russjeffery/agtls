import { createHash } from "crypto";
import { agentAuth } from "@better-auth/agent-auth";
import { createFromOpenAPI } from "@better-auth/agent-auth/openapi";
import { db, apiKey } from "@/lib/db";
import { newApiKey, newId } from "@/lib/api/ids";
import { findOrCreatePrimaryOrg } from "@/lib/orgs/service";
import { getOpenApiDocument } from "@/lib/openapi/document";

// The @better-auth/agent-auth plugin, wired as a second agent-auth surface
// alongside the hand-rolled ID-JAG/claim system in this directory. Capabilities
// are derived from the public REST OpenAPI document (one per operationId), and
// execution is proxied back to that same REST API.
//
// The plugin owns the discovery → register → request → approve → execute flow
// and verifies the agent's signed JWT and capability grant before calling
// `onExecute` (the OpenAPI proxy handler). We only have to (a) authenticate the
// proxied request to our own API and (b) render the device-approval page.

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

// Proxied capability calls hit our REST API, which scopes resources by the
// organization behind an `agt_…` key. We mint a short-lived org key for the
// agent's delegated user so its actions land in the human's organization (the
// same ownership model a signed-in human gets). Keys are cached per isolate and
// expire, so we write at most ~one row per user per hour per isolate.
const PROXY_KEY_TTL_MS = 60 * 60 * 1000; // 1 hour
const proxyKeyCache = new Map<string, { key: string; expiresAt: number }>();

async function resolveProxyKey(userId: string): Promise<string> {
  const cached = proxyKeyCache.get(userId);
  // Reuse while comfortably clear of expiry (resolveAuth rejects expired keys).
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.key;

  const organizationId = await findOrCreatePrimaryOrg(userId);
  const raw = newApiKey();
  const expiresAt = new Date(Date.now() + PROXY_KEY_TTL_MS);
  await db.insert(apiKey).values({
    id: newId("apiKey"),
    organizationId,
    name: "Agent capability proxy",
    keyPrefix: raw.slice(0, 20),
    keyHash: createHash("sha256").update(raw).digest("hex"),
    scopes: ["api.read", "api.write"],
    expiresAt,
    createdByAgent: true,
    createdAt: new Date(),
  });
  proxyKeyCache.set(userId, { key: raw, expiresAt: expiresAt.getTime() });
  return raw;
}

export function agentAuthPlugin() {
  return agentAuth({
    // Delegated only: a human approves each agent. (Autonomous mode would
    // additionally need resolveAutonomousUser; the ID-JAG system covers that
    // shape today.)
    modes: ["delegated"],
    deviceAuthorizationPage: "/device/capabilities",
    // Deployed behind Cloudflare — trust X-Forwarded-Proto for JWT `aud` checks.
    trustProxy: true,
    ...createFromOpenAPI(
      getOpenApiDocument() as Parameters<typeof createFromOpenAPI>[0],
      {
        baseUrl: appUrl(),
        // Read-only operations are auto-granted to new hosts; mutations require
        // explicit approval through the device flow.
        defaultHostCapabilities: ["GET"],
        async resolveHeaders({
          agentSession,
        }): Promise<Record<string, string>> {
          const userId = agentSession.user?.id;
          if (!userId) return {};
          return { Authorization: `Bearer ${await resolveProxyKey(userId)}` };
        },
      }
    ),
    providerName: "agtls",
    providerDescription:
      "Open infrastructure for AI agents — REST + MCP, capability-scoped for delegated agents.",
  });
}
