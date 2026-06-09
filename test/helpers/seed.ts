import { createHash } from "node:crypto";
import { testDb } from "./db";
import { user, project, apiKey } from "@/lib/db/schema";
import { newId, newApiKey } from "@/lib/api/ids";

function hash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface SeededProject {
  userId: string;
  projectId: string;
  /** Plaintext API key — pass as the Bearer token. */
  key: string;
  apiKeyId: string;
}

let slugCounter = 0;

/**
 * Seed a user + project + a single live API key. Returns the plaintext key for
 * use as a Bearer token. Each call is independent (unique slug/email).
 */
export async function seedProject(
  opts: {
    environment?: "live" | "test";
    name?: string;
    /** Override the issued key (e.g. to seed an expired or scoped credential). */
    scopes?: string[] | null;
    expiresAt?: Date | null;
  } = {}
): Promise<SeededProject> {
  const n = slugCounter++;
  const userId = newId("project").replace("prj_", "usr_") + `_${n}`;
  const now = new Date();

  await testDb.insert(user).values({
    id: userId,
    name: `Test User ${n}`,
    email: `user${n}-${Date.now()}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });

  const projectId = newId("project");
  await testDb.insert(project).values({
    id: projectId,
    userId,
    name: opts.name ?? `Project ${n}`,
    slug: `project-${n}-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  });

  const environment = opts.environment ?? "live";
  const key = newApiKey(environment);
  const apiKeyId = newId("apiKey");
  await testDb.insert(apiKey).values({
    id: apiKeyId,
    projectId,
    name: "Test key",
    keyPrefix: key.slice(0, 20),
    keyHash: hash(key),
    environment,
    scopes: opts.scopes === undefined ? null : opts.scopes,
    expiresAt: opts.expiresAt ?? null,
    createdAt: now,
  });

  return { userId, projectId, key, apiKeyId };
}
