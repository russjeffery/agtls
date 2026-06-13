import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import * as schema from "@/lib/db/schema";

// A single in-process SQLite instance (libsql, in-memory) shared across the
// whole vitest run. This is what `@/lib/db` is mocked to point at (see
// test/setup.ts), so route handlers and the agent-auth service execute real
// SQL with no network — and against the same SQL dialect as production D1.
export const client = createClient({ url: ":memory:" });
export const testDb = drizzle(client, { schema });

let migrated = false;

/** Create the full schema in the in-memory database (idempotent). */
export async function migrate(): Promise<void> {
  if (migrated) return;
  const statements = await generateSQLiteMigration(
    await generateSQLiteDrizzleJson({}),
    // drizzle-kit's types are loose here; the schema module is the source of truth.
    await generateSQLiteDrizzleJson(schema as Record<string, unknown>)
  );
  for (const statement of statements) {
    await client.execute(statement);
  }
  migrated = true;
}

// Every table in the schema, children before parents — SQLite has no
// TRUNCATE ... CASCADE, so plain DELETEs must respect foreign keys.
const TABLES = [
  "verification",
  "account",
  "session",
  "agent_audit_event",
  "agent_assertion_jti",
  "agent_registration",
  "webhook_event",
  "webhook_endpoint",
  "scheduled_message",
  "artifact",
  "task",
  "api_key",
  "invitation",
  "member",
  "organization",
  "user",
];

/** Wipe all rows between tests for isolation. */
export async function resetDb(): Promise<void> {
  await migrate();
  await client.batch(
    TABLES.map((table) => `DELETE FROM "${table}";`),
    "write"
  );
}
