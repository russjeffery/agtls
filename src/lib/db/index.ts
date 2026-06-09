import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Driver selection.
//
// Production / dev: the Neon serverless HTTP driver, keyed off DATABASE_URL.
//
// E2E tests: when AGTLS_TEST_DB_DIR is set we run against an in-process PGlite
// (WASM Postgres) persisted to that directory, so the whole app can be exercised
// by a real browser with zero external services. pglite is loaded lazily via a
// CommonJS require so it is never pulled into the production bundle.
function makeDb() {
  const testDir = process.env.AGTLS_TEST_DB_DIR;
  if (testDir) {
    // Next bundles route handlers and server components into separate chunks,
    // each of which evaluates this module. A PGlite instance is an independent
    // in-memory database, so a per-module instance would mean writes from one
    // route aren't visible to reads from another. Memoize on globalThis so the
    // whole Node process shares exactly one PGlite (and one connection).
    const g = globalThis as unknown as { __agtlsTestDb?: unknown };
    if (!g.__agtlsTestDb) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createRequire } = require("module");
      const req = createRequire(import.meta.url);
      const { PGlite } = req("@electric-sql/pglite");
      const { drizzle: pgliteDrizzle } = req("drizzle-orm/pglite");
      g.__agtlsTestDb = pgliteDrizzle(new PGlite(testDir), { schema });
    }
    return g.__agtlsTestDb;
  }
  const sql = neon(process.env.DATABASE_URL!);
  return drizzle(sql, { schema });
}

export const db = makeDb() as ReturnType<typeof drizzle<typeof schema>>;

export * from "./schema";
