import { join } from "node:path";

// Shared, fixed locations for the E2E test database (a SQLite file) and the
// captured-email log. Referenced by both the Playwright config (passed
// into the dev server's env) and global-setup (which migrates the DB).
// process.cwd() is the project root for both `playwright` and `next dev`.
const root = process.cwd();

export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DB_DIR = join(root, ".e2e-tmp", "db");
export const E2E_EMAIL_FILE = join(root, ".e2e-tmp", "emails.jsonl");
