import { test, expect } from "@playwright/test";

// Browser-driven coverage of the public UI surface: the landing page, the
// content-negotiated HTML rendering of the REST resources, and the public
// discovery documents. All runs against the real dev server (PGlite-backed).

test.describe("landing page", () => {
  test("shows the wordmark, tagline and live tools", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("agtls").first()).toBeVisible();
    await expect(
      page.getByText("Open-source infrastructure for AI agents")
    ).toBeVisible();
    await expect(page.getByText("Tasks", { exact: true })).toBeVisible();
    await expect(page.getByText("Webhook Catcher")).toBeVisible();
    await expect(page.getByText("POST /api/mcp")).toBeVisible();
  });
});

test.describe("content negotiation", () => {
  test("serves an HTML list page with the API reference to browsers", async ({
    page,
  }) => {
    const res = await page.goto("/api/tasks");
    expect(res?.status()).toBe(200);
    expect(res?.headers()["content-type"]).toContain("text/html");
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await expect(page.getByText("API Reference")).toBeVisible();
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

  test("renders a created resource's detail page and supports row navigation", async ({
    page,
    request,
  }) => {
    // Create a public task via the API, then view it in the browser.
    const created = await request.post("/api/tasks", {
      data: { name: "E2E Visible Task" },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: string };

    // Detail page shows the JSON resource.
    await page.goto(`/api/tasks/${id}`);
    await expect(page.getByText("Resource")).toBeVisible();
    await expect(page.getByText(id).first()).toBeVisible();

    // The list page shows the row; clicking it navigates to the detail page.
    await page.goto("/api/tasks");
    const row = page.getByText("E2E Visible Task");
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/api/tasks/${id}$`));
  });

  test("shows an empty state for a resource with no items", async ({ page }) => {
    await page.goto("/api/subtasks");
    await expect(page.getByText(/No items yet/i)).toBeVisible();
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
      headers: { authorization: "Bearer agt_live_definitelyinvalid" },
    });
    expect(res.status()).toBe(401);
    expect(res.headers()["www-authenticate"]).toContain(
      "resource_metadata="
    );
  });
});
