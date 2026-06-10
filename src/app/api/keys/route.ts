import { NextRequest } from "next/server";
import { z } from "zod";
import { db, apiKey } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";
import { findOrCreatePrimaryOrg } from "@/lib/orgs/service";
import { newApiKey, newId } from "@/lib/api/ids";
import { hashApiKey } from "@/lib/api/middleware";
import { created, errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { headers } from "next/headers";

// Create an API key "for a user" rather than for a named organization: mints
// the key against the caller's primary org, provisioning a personal org first
// when they own none. This is what the /keys page uses to let a brand-new user
// (no org yet) issue their first key without a detour through the dashboard.
const createSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function POST(request: NextRequest) {
  const session = await betterAuth.api.getSession({ headers: await headers() });
  if (!session) return errorResponse(errors.unauthorized(), 401);

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  const orgId = await findOrCreatePrimaryOrg(session.user.id);

  const rawKey = newApiKey();
  const keyPrefix = rawKey.slice(0, 20);
  const keyHash = hashApiKey(rawKey);
  const keyId = newId("apiKey");

  await db.insert(apiKey).values({
    id: keyId,
    organizationId: orgId,
    name: body.name,
    keyPrefix,
    keyHash,
    createdAt: new Date(),
  });

  return created({
    id: keyId,
    object: "api_key" as const,
    organization_id: orgId,
    name: body.name,
    key: rawKey,
    scopes: null,
    expires_at: null,
    created_by_agent: false,
    last_used_at: null,
    revoked_at: null,
    created_at: Math.floor(Date.now() / 1000),
  });
}
