import { createHash } from "node:crypto";
import { testDb } from "./db";
import { user, organization, member, apiKey } from "@/lib/db/schema";
import { newId, newApiKey } from "@/lib/api/ids";

function hash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface SeededOrganization {
  userId: string;
  organizationId: string;
  /** Plaintext API key — pass as the Bearer token. */
  key: string;
  apiKeyId: string;
}

let slugCounter = 0;

/**
 * Seed a user + organization (user as owner member) + a single live API key.
 * Returns the plaintext key for use as a Bearer token. Each call is
 * independent (unique slug/email).
 */
export async function seedOrganization(
  opts: {
    name?: string;
    /** Override the issued key (e.g. to seed an expired or scoped credential). */
    scopes?: string[] | null;
    expiresAt?: Date | null;
  } = {}
): Promise<SeededOrganization> {
  const n = slugCounter++;
  const userId = newId("organization").replace("org_", "usr_") + `_${n}`;
  const now = new Date();

  await testDb.insert(user).values({
    id: userId,
    name: `Test User ${n}`,
    email: `user${n}-${Date.now()}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });

  const organizationId = newId("organization");
  await testDb.insert(organization).values({
    id: organizationId,
    name: opts.name ?? `Org ${n}`,
    slug: `org-${n}-${Date.now()}`,
    createdAt: now,
  });
  await testDb.insert(member).values({
    id: newId("member"),
    organizationId,
    userId,
    role: "owner",
    createdAt: now,
  });

  const key = newApiKey();
  const apiKeyId = newId("apiKey");
  await testDb.insert(apiKey).values({
    id: apiKeyId,
    organizationId,
    name: "Test key",
    keyPrefix: key.slice(0, 20),
    keyHash: hash(key),
    scopes: opts.scopes === undefined ? null : opts.scopes,
    expiresAt: opts.expiresAt ?? null,
    createdAt: now,
  });

  return { userId, organizationId, key, apiKeyId };
}
