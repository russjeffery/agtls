import { rm, mkdir, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../../src/lib/db/schema";
import { E2E_DB_DIR, E2E_EMAIL_FILE } from "./paths";

// Build a fresh persisted PGlite database with the full schema and reset the
// captured-email log. Run by the Playwright webServer command (before next dev)
// as a standalone tsx process, so the WASM/ESM handling stays out of
// Playwright's own module loader and ordering is deterministic.
async function main() {
  await rm(E2E_DB_DIR, { recursive: true, force: true });
  await mkdir(E2E_DB_DIR, { recursive: true });
  await writeFile(E2E_EMAIL_FILE, "");

  const client = new PGlite(E2E_DB_DIR);
  try {
    const statements = await generateMigration(
      generateDrizzleJson({}),
      generateDrizzleJson(schema as Record<string, unknown>)
    );
    for (const statement of statements) {
      await client.exec(statement);
    }
  } finally {
    await client.close();
  }
  console.log(`migrated e2e db at ${E2E_DB_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
