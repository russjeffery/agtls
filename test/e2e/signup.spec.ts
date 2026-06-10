import { test, expect } from "@playwright/test";
import { readEmails } from "./helpers";

// Browser-driven coverage of the human sign-up flow and the agent callout.
// The e2e server has no social provider credentials configured, so only the
// email form renders — social buttons are exercised by their absence.

test.describe("sign-up page", () => {
  test("renders the form and the agent self-signup callout", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(
      page.getByRole("heading", { name: "Create your account" })
    ).toBeVisible();
    await expect(page.getByLabel("Name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    // Agent callout: self-signup one-liner, skill link, copyable prompt.
    await expect(page.getByText("Are you an agent?")).toBeVisible();
    await expect(page.getByText('{"type": "anonymous"}')).toBeVisible();
    await expect(
      page.getByRole("link", { name: /skill\.md/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /copy prompt for your agent/i })
    ).toBeVisible();

    // No social credentials configured on the e2e server → no social buttons.
    await expect(page.getByText("Continue with GitHub")).toHaveCount(0);
    await expect(page.getByText("Continue with Google")).toHaveCount(0);
  });

  test("email sign-up creates the account, sends verification, lands on the dashboard", async ({
    page,
  }) => {
    const email = `e2e-human-${Date.now()}@example.com`;

    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("E2E Human");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("hunter2hunter2");
    await page.getByRole("button", { name: "Create account" }).click();

    // Signed in and redirected to the session-guarded dashboard, where the
    // auto-created personal org is listed.
    await page.waitForURL("**/dashboard");
    await expect(
      page.getByRole("heading", { name: "Your organizations" })
    ).toBeVisible();
    await expect(page.getByText("E2E Human's org")).toBeVisible();

    // A verification email went out (captured to the e2e email log).
    await expect(async () => {
      const emails = await readEmails();
      const msg = emails.find((m) => m.to === email);
      expect(msg).toBeTruthy();
      expect(msg!.subject).toContain("Verify");
    }).toPass({ timeout: 10_000 });
  });

  test("sign-in works for an existing account", async ({ page }) => {
    const email = `e2e-signin-${Date.now()}@example.com`;

    // Create the account through the UI, then sign out by clearing cookies.
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Returning Human");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("hunter2hunter2");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard");
    await page.context().clearCookies();

    await page.goto("/sign-in");
    await expect(
      page.getByRole("heading", { name: "Welcome back" })
    ).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("hunter2hunter2");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await expect(
      page.getByRole("heading", { name: "Your organizations" })
    ).toBeVisible();
  });

  test("shows an error for bad credentials", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });
});

test.describe("agent skill document", () => {
  test("serves the markdown skill at /skill.md", async ({ request }) => {
    const res = await request.get("/skill.md");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain('{"type": "anonymous"}');
    expect(text).toContain("/api/agent/auth");
  });
});
