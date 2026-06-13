import {
  drizzle,
  type AnyD1Database,
  type DrizzleD1Database,
} from "drizzle-orm/d1";
import { sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

export type Db = DrizzleD1Database<typeof schema>;

// Driver selection.
//
// Production / dev: Cloudflare D1, reached through the `DB` binding. The
// binding only exists inside a request (OpenNext threads it through
// AsyncLocalStorage; `initOpenNextCloudflareForDev` does the same for
// `next dev`), so `db` is a lazy proxy that resolves the real Drizzle
// instance on first use per request instead of at module scope.
//
// E2E tests: when AGTLS_TEST_DB_DIR is set we run against a local SQLite file
// (via libsql) in that directory, so the whole app can be exercised by a real
// browser with zero Cloudflare services. libsql is loaded lazily via a
// CommonJS require so it is never pulled into the production bundle.
function makeTestDb(dir: string): Db {
  // Next bundles route handlers and server components into separate chunks,
  // each of which evaluates this module. Memoize on globalThis so the whole
  // Node process shares exactly one connection to the test database.
  const g = globalThis as unknown as { __agtlsTestDb?: Db };
  if (!g.__agtlsTestDb) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRequire } = require("module");
    const req = createRequire(import.meta.url);
    const { createClient } = req("@libsql/client");
    const { drizzle: libsqlDrizzle } = req("drizzle-orm/libsql");
    const client = createClient({ url: `file:${dir}/db.sqlite` });
    g.__agtlsTestDb = libsqlDrizzle(client, { schema }) as unknown as Db;
  }
  return g.__agtlsTestDb;
}

// One Drizzle instance per D1 binding. Within a Worker isolate the binding
// object is stable across requests, so this is effectively a singleton.
const d1Cache = new WeakMap<object, Db>();

function resolveDb(): Db {
  const testDir = process.env.AGTLS_TEST_DB_DIR;
  if (testDir) return makeTestDb(testDir);

  const { env } = getCloudflareContext();
  const d1 = (env as { DB?: AnyD1Database }).DB;
  if (!d1) {
    throw new Error(
      "D1 binding `DB` not found. Create the database (wrangler d1 create) and check the d1_databases block in wrangler.jsonc."
    );
  }
  let instance = d1Cache.get(d1);
  if (!instance) {
    instance = drizzle(d1, { schema });
    d1Cache.set(d1, instance);
  }
  return instance;
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = resolveDb();
    const value = Reflect.get(real as object, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * SQLite replacement for Postgres `arrayContains` on JSON-encoded string
 * arrays: true when `column` (a `text({ mode: "json" })` array) contains every
 * one of `labels`.
 */
export function jsonArrayContains(
  column: SQLiteColumn,
  labels: string[]
): SQL {
  const checks = labels.map(
    (label) =>
      sql`exists (select 1 from json_each(coalesce(${column}, '[]')) where json_each.value = ${label})`
  );
  return sql.join(checks, sql` and `);
}

export * from "./schema";
