import { rm, mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import * as schema from "../../src/lib/db/schema";
import { E2E_DB_DIR, E2E_EMAIL_FILE } from "./paths";

// Build a fresh SQLite database file with the full schema and reset the
// captured-email log. Run by the e2e script (before next dev) as a standalone
// tsx process so ordering is deterministic. The app reaches the same file via
// the AGTLS_TEST_DB_DIR seam in src/lib/db/index.ts.
async function main() {
  await rm(E2E_DB_DIR, { recursive: true, force: true });
  await mkdir(E2E_DB_DIR, { recursive: true });
  await writeFile(E2E_EMAIL_FILE, "");

  const client = createClient({ url: `file:${E2E_DB_DIR}/db.sqlite` });
  try {
    const statements = await generateSQLiteMigration(
      await generateSQLiteDrizzleJson({}),
      await generateSQLiteDrizzleJson(schema as Record<string, unknown>)
    );
    for (const statement of statements) {
      await client.execute(statement);
    }
  } finally {
    client.close();
  }
  console.log(`migrated e2e db at ${E2E_DB_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
