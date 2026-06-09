import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "@/lib/db/schema";

// A single in-process PGlite (WASM Postgres) instance shared across the whole
// vitest run. This is what `@/lib/db` is mocked to point at (see test/setup.ts),
// so route handlers and the agent-auth service execute real SQL with no network.
export const client = new PGlite();
export const testDb = drizzle(client, { schema });

let migrated = false;

/** Create the full schema in the in-memory database (idempotent). */
export async function migrate(): Promise<void> {
  if (migrated) return;
  const statements = await generateMigration(
    generateDrizzleJson({}),
    // drizzle-kit's types are loose here; the schema module is the source of truth.
    generateDrizzleJson(schema as Record<string, unknown>)
  );
  for (const statement of statements) {
    await client.exec(statement);
  }
  migrated = true;
}

// Every table in the schema, child-before-parent ordering is irrelevant because
// we TRUNCATE ... CASCADE.
const TABLES = [
  "verification",
  "account",
  "session",
  "agent_audit_event",
  "agent_assertion_jti",
  "agent_registration",
  "webhook_event",
  "webhook_endpoint",
  "subtask",
  "task",
  "api_key",
  "project",
  '"user"',
];

/** Wipe all rows between tests for isolation. */
export async function resetDb(): Promise<void> {
  await migrate();
  await testDb.execute(
    sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`)
  );
}
