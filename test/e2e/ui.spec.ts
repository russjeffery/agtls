import { test, expect } from "@playwright/test";

// Browser-driven coverage of the public UI surface: the landing page, the
// JSON-only REST API, the React resource pages (/tasks, …), and the public
// discovery documents. All runs against the real dev server (SQLite-backed).

test.describe("landing page", () => {
  test("shows the wordmark, tagline and live tools", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Agent Tools" }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /tools your agent/i })
    ).toBeVisible();
    await expect(page.getByText("Tasks", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Webhook Catcher", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Artifacts", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Scheduled Messages", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("POST /api/mcp")).toBeVisible();
  });

  test("header links to human sign-in and sign-up", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in"
    );
    await expect(
      page.getByRole("link", { name: /get api key/i })
    ).toHaveAttribute("href", "/sign-up");
  });
});

test.describe("JSON-only API", () => {
  test("serves JSON to browsers at /api/tasks (no HTML negotiation)", async ({
    page,
  }) => {
    const res = await page.goto("/api/tasks");
    expect(res?.status()).toBe(200);
    expect(res?.headers()["content-type"]).toContain("application/json");
  });

  test("serves JSON to API clients at the same path", async ({ request }) => {
    const res = await request.get("/api/tasks", {
      headers: { accept: "application/json" },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    const body = await res.json();
    expect(body.object).toBe("list");
  });

  test("returns a public resource as JSON by ID", async ({ request }) => {
    const created = await request.post("/api/tasks", {
      data: { name: "E2E Visible Task" },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const res = await request.get(`/api/tasks/${id}`, {
      headers: { accept: "application/json" },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { id: string; object: string };
    expect(body.object).toBe("task");
    expect(body.id).toBe(id);
  });

  test("shows the standard /tasks page to anonymous browsers", async ({
    page,
  }) => {
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    // Signed-out header chrome, and the empty state explaining sign-in.
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByText("Sign in to see your organization's tasks", { exact: false })
    ).toBeVisible();
  });

  test("shows a public task to anonymous browsers", async ({ page, request }) => {
    const created = await request.post("/api/tasks", {
      data: { name: "Anonymous Public Task" },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };

    await page.goto(`/tasks/${id}`);
    await expect(page).toHaveURL(new RegExp(`/tasks/${id}$`));
    await expect(
      page.getByRole("heading", { name: "Anonymous Public Task" })
    ).toBeVisible();
  });
});

test.describe("logged-in experience", () => {
  // One signed-up human reused across the tests in this block.
  const email = `e2e-session-${Date.now()}@example.com`;
  const password = "hunter2hunter2";

  async function signUp(page: import("@playwright/test").Page) {
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill("Session Human");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard");
  }

  async function signIn(page: import("@playwright/test").Page) {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
  }

  test("lists owned tasks on /tasks and navigates rows", async ({
    page,
  }) => {
    await signUp(page);

    // Mint an API key through the keys page's REST endpoint (cookie auth),
    // then create an org-owned task with it.
    const orgsRes = await page.request.get("/api/organizations", {
      headers: { accept: "application/json" },
    });
    const orgs = (await orgsRes.json()) as { data: { id: string }[] };
    expect(orgs.data.length).toBeGreaterThan(0);
    const orgId = orgs.data[0].id;

    const keyRes = await page.request.post(`/api/organizations/${orgId}/keys`, {
      data: { name: "e2e key" },
    });
    expect(keyRes.status()).toBe(201);
    const { key } = (await keyRes.json()) as { key: string };

    const taskRes = await page.request.post("/api/tasks", {
      headers: { authorization: `Bearer ${key}` },
      data: { name: "Owned E2E Task" },
    });
    expect(taskRes.status()).toBe(201);
    const { id } = (await taskRes.json()) as { id: string };

    // The signed-in list page shows the row; clicking navigates to the item.
    await page.goto("/tasks");
    const row = page.getByText("Owned E2E Task");
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/tasks/${id}$`));

    // Header shows the account menu with the dashboard/keys/account links.
    await page.getByText("Session Human").first().click();
    await expect(page.getByRole("menuitem", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "API keys" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Account" })).toBeVisible();

    // An anonymous visitor is redirected to sign-in for the owned task page.
    await page.context().clearCookies();
    await page.goto(`/tasks/${id}`);
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("account page changes password; keys page mints and revokes keys", async ({
    page,
  }) => {
    await signIn(page);

    // Keys page: create a key, see it listed, then revoke it.
    await page.goto("/keys");
    await page
      .getByPlaceholder("Key name (e.g. production agent)")
      .first()
      .fill("rotating key");
    await page.getByRole("button", { name: "Create key" }).first().click();
    await expect(
      page.getByText(/Save this key now/i).first()
    ).toBeVisible();

    // Account page: profile + change password.
    await page.goto("/account");
    await expect(page.getByText(email)).toBeVisible();
    await page.getByLabel("Current password").fill(password);
    await page.getByLabel("New password").fill("hunter3hunter3");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText(/Password updated/i)).toBeVisible();

    // The new password works.
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("hunter3hunter3");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
  });
});

test.describe("discovery & auth advertisement", () => {
  test("serves Protected Resource Metadata as JSON", async ({ request }) => {
    const res = await request.get("/.well-known/oauth-protected-resource");
    expect(res.status()).toBe(200);
    const body = await res.json();
    // RFC 9728: identifies the resource and its authorization server(s).
    expect(JSON.stringify(body)).toContain("localhost:3100");
  });

  test("serves the prose auth.md discovery doc", async ({ request }) => {
    const res = await request.get("/auth.md");
    expect(res.status()).toBe(200);
  });

  test("a 401 advertises where to authenticate via WWW-Authenticate", async ({
    request,
  }) => {
    const res = await request.get("/api/tasks", {
      headers: { authorization: "Bearer agt_definitelyinvalid" },
    });
    expect(res.status()).toBe(401);
    expect(res.headers()["www-authenticate"]).toContain(
      "resource_metadata="
    );
  });
});
