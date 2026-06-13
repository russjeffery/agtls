import { defineConfig } from "drizzle-kit";

// D1 is SQLite. `drizzle-kit generate` writes migration SQL into ./drizzle
// (no database connection needed); apply it with
// `npm run db:migrate:local` / `db:migrate:remote` (wrangler d1 migrations).
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
