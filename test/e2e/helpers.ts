import { readFile } from "node:fs/promises";
import { expect, type APIRequestContext } from "@playwright/test";
import { E2E_EMAIL_FILE } from "./paths";

export interface CapturedEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  at: number;
}

/** Read all emails the running server captured to the E2E email log. */
export async function readEmails(): Promise<CapturedEmail[]> {
  let raw = "";
  try {
    raw = await readFile(E2E_EMAIL_FILE, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CapturedEmail);
}

/** Most recent email sent to `to` (or the latest overall when `to` omitted). */
export async function latestEmail(to?: string): Promise<CapturedEmail | undefined> {
  const all = await readEmails();
  const filtered = to ? all.filter((m) => m.to === to) : all;
  return filtered[filtered.length - 1];
}

/** Poll the email log until an email to `to` arrives, then return its claim path. */
export async function waitForClaimPath(to: string, timeoutMs = 5000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const msg = await latestEmail(to);
    const match = msg?.text.match(/\/agent\/claim\/cvt_[A-Za-z0-9]+/);
    if (match) return match[0];
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No claim email for ${to} within ${timeoutMs}ms`);
}

/**
 * Start the anonymous agent-auth flow over HTTP and return the credential +
 * claim_token. Handy for seeding browser tests of the claim ceremony.
 */
export async function startAnonymousRegistration(request: APIRequestContext) {
  const res = await request.post("/api/agent/auth", {
    data: { type: "anonymous", requested_credential_type: "api_key" },
  });
  expect(res.status()).toBe(201);
  return res.json() as Promise<{
    registration_id: string;
    credential: string;
    claim_token: string;
  }>;
}
