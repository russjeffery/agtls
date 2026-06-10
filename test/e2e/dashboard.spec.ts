import { test, expect } from "@playwright/test";
import {
  latestEmail,
  waitForClaimPath,
  startAnonymousRegistration,
} from "./helpers";

// The headline org-model flow, end to end in a real browser: a human signs up,
// verifies their email, an agent claims into their account — and the human's
// dashboard shows the agent as a member of their organization.

test("dashboard shows an agent that claimed into the human's org", async ({
  page,
  request,
}) => {
  const email = `e2e-dash-${Date.now()}@example.com`;

  // 1. Human signs up through the UI and lands on the dashboard with their
  //    auto-created personal org.
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Dash Human");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("hunter2hunter2");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByText("Dash Human's org")).toBeVisible();

  // 2. Human verifies their email (agents only bind to verified emails).
  await expect(async () => {
    const msg = await latestEmail(email);
    expect(msg?.text).toContain("/api/auth/verify-email");
  }).toPass({ timeout: 10_000 });
  const verification = await latestEmail(email);
  const url = verification!.text.match(/https?:\/\/\S+/)![0];
  await page.goto(url);

  // 3. An agent registers anonymously and claims with the human's email,
  //    completing the OTP ceremony.
  const { claim_token } = await startAnonymousRegistration(request);
  const claimStart = await request.post("/api/agent/auth/claim", {
    data: { claim_token, email },
  });
  expect(claimStart.status()).toBe(200);

  const claimPath = await waitForClaimPath(email);
  await page.goto(claimPath);
  await page.getByRole("button", { name: /show my one-time code/i }).click();
  const otp = (await page.getByLabel("one-time code").textContent())?.trim() ?? "";
  const complete = await request.post("/api/agent/auth/claim/complete", {
    data: { claim_token, otp },
  });
  expect(complete.status()).toBe(200);

  // 4. The human's dashboard now lists the agent's org with the human as
  //    owner and the agent as a member, plus the agent-issued key.
  await page.goto("/dashboard");
  await expect(page.getByText("1 agent with access")).toBeVisible();
  await expect(page.getByText("agent", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("agent-issued").first()).toBeVisible();
});
