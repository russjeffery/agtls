import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL } from "./test/e2e/paths";

// E2E config. The server lifecycle (migrate a fresh in-process PGlite database,
// boot `next dev`, tear down) is managed by scripts/e2e.sh — run the suite with
// `npm run test:e2e`, not `playwright test` directly. The dev server captures
// claim emails to a file (AGTLS_TEST_EMAIL_FILE) via src/lib/email.ts, so the
// whole app is exercised by a real browser with no external services.
export default defineConfig({
  testDir: "./test/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
