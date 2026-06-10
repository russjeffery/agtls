import { test, expect } from "@playwright/test";
import { waitForClaimPath } from "./helpers";

// Foundation E2E smoke: proves the dev server boots against the PGlite test DB,
// content negotiation serves HTML, and the browser-driven claim ceremony works
// end to end (server action mints the OTP, API completes the claim).

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});

test("resource API serves an HTML page to browsers", async ({ page }) => {
  const res = await page.goto("/api/tasks");
  expect(res?.status()).toBe(200);
  expect(res?.headers()["content-type"]).toContain("text/html");
});

test("email-verification claim ceremony works through the browser", async ({
  page,
  request,
}) => {
  const email = `e2e-${Date.now()}@example.com`;

  // 1. Agent registers, asking the user to verify by email.
  const reg = await request.post("/api/agent/auth", {
    data: {
      type: "identity_assertion",
      assertion_type: "verified_email",
      assertion: email,
    },
  });
  expect(reg.status()).toBe(201);
  const { claim_token } = (await reg.json()) as { claim_token: string };

  // 2. The captured claim email links to the OTP page.
  const claimPath = await waitForClaimPath(email);

  // 3. The user opens the link and reveals the code in the browser.
  await page.goto(claimPath);
  await expect(
    page.getByRole("heading", { name: /Confirm agent access/i })
  ).toBeVisible();
  await page.getByRole("button", { name: /show my one-time code/i }).click();
  const codeEl = page.getByLabel("one-time code");
  await expect(codeEl).toBeVisible();
  const otp = (await codeEl.textContent())?.trim() ?? "";
  expect(otp).toMatch(/^\d{6}$/);

  // 4. The agent completes the claim with the code read back to it.
  const complete = await request.post("/api/agent/auth/claim/complete", {
    data: { claim_token, otp },
  });
  expect(complete.status()).toBe(200);
  const body = (await complete.json()) as { status: string; credential: string };
  expect(body.status).toBe("claimed");
  expect(body.credential).toMatch(/^agt_/);
});
