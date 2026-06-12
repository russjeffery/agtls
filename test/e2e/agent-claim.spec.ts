import { test, expect } from "@playwright/test";
import { waitForClaimPath, startAnonymousRegistration } from "./helpers";

// Browser-driven coverage of the user-claimed agent sign-up ceremonies. The OTP
// is only ever minted by the explicit confirm click (a POST server action), so
// these tests drive the real page interaction, not just the API.

test("anonymous claim ceremony: register → claim → reveal OTP → complete", async ({
  page,
  request,
}) => {
  const email = `anon-${Date.now()}@example.com`;

  // 1. Agent registers anonymously and gets an immediate pre-claim credential.
  const { claim_token, credential } = await startAnonymousRegistration(request);
  expect(credential).toMatch(/^agt_/);

  // The pre-claim credential authenticates against the resource API.
  const readBefore = await request.get("/api/tasks", {
    headers: { authorization: `Bearer ${credential}` },
  });
  expect(readBefore.status()).toBe(200);

  // 2. User starts the claim by supplying their email; an email is sent.
  const claimStart = await request.post("/api/agent/auth/claim", {
    data: { claim_token, email },
  });
  expect(claimStart.status()).toBe(200);

  // 3. The user opens the emailed link and reveals the one-time code.
  const claimPath = await waitForClaimPath(email);
  await page.goto(claimPath);
  await expect(
    page.getByRole("heading", { name: /Confirm agent access/i })
  ).toBeVisible();
  await page.getByRole("button", { name: /show my one-time code/i }).click();
  const otp = (await page.getByLabel("one-time code").textContent())?.trim() ?? "";
  expect(otp).toMatch(/^\d{6}$/);

  // 4. The agent completes the claim with the code read back to it.
  const complete = await request.post("/api/agent/auth/claim/complete", {
    data: { claim_token, otp },
  });
  expect(complete.status()).toBe(200);
  expect((await complete.json()).status).toBe("claimed");

  // 5. After claiming, the SAME credential is upgraded in place and can WRITE.
  const writeAfter = await request.post("/api/tasks", {
    headers: { authorization: `Bearer ${credential}` },
    data: { name: "written after claim" },
  });
  expect(writeAfter.status()).toBe(201);
});

test("an expired or unknown claim link shows the 'Link expired' page", async ({
  page,
}) => {
  await page.goto("/agent/claim/cvt_thisdoesnotexist");
  await expect(page.getByRole("heading", { name: /Link expired/i })).toBeVisible();
  // No reveal button is offered for an invalid link.
  await expect(
    page.getByRole("button", { name: /show my one-time code/i })
  ).toHaveCount(0);
});

test("the reveal page does not mint an OTP on GET (scanner-safe)", async ({
  page,
  request,
}) => {
  const email = `scan-${Date.now()}@example.com`;
  await request.post("/api/agent/auth", {
    data: {
      type: "service_auth",
      login_hint: email,
    },
  });
  const claimPath = await waitForClaimPath(email);

  // Visiting (GET) shows the confirm button but never reveals a code until the
  // user clicks — i.e. no 6-digit code is present on initial render.
  await page.goto(claimPath);
  await expect(
    page.getByRole("button", { name: /show my one-time code/i })
  ).toBeVisible();
  await expect(page.getByLabel("one-time code")).toHaveCount(0);
});
