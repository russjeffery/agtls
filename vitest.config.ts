import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    // Each worker process gets its own module-level in-memory SQLite instance
    // (see test/helpers/db.ts) and clears tables between tests, so cross-file
    // parallelism is safe; tests within a file run sequentially.
    include: ["test/**/*.test.ts"],
    exclude: ["test/e2e/**", "node_modules/**"],
    // A migrate() on first DB access can take a moment on cold start.
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
