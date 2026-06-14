import { describe, it, expect } from "vitest";
import { apiCatalogLinkset } from "@/lib/agent-auth/discovery";

// The harness sets NEXT_PUBLIC_APP_URL = "https://app.example.com".
const APP = "https://app.example.com";

// ─── API Catalog (RFC 9727) ──────────────────────────────────────────────────

describe("apiCatalogLinkset", () => {
  it("anchors the catalog at the well-known URL and lists each API as an item", () => {
    const { linkset } = apiCatalogLinkset();
    const catalog = linkset[0];

    expect(catalog.anchor).toBe(`${APP}/.well-known/api-catalog`);
    expect(catalog.item?.map((i) => i.href)).toEqual([
      `${APP}/api`,
      `${APP}/api/mcp`,
    ]);
  });

  it("describes the REST API with service-desc/-doc/-meta links", () => {
    const { linkset } = apiCatalogLinkset();
    const rest = linkset.find((c) => c.anchor === `${APP}/api`);

    expect(rest?.["service-desc"]?.[0]).toMatchObject({
      href: `${APP}/api/openapi.json`,
      type: "application/openapi+json",
    });
    expect(rest?.["service-doc"]?.[0].href).toBe(`${APP}/docs/api`);
    expect(rest?.["service-meta"]?.[0].href).toBe(
      `${APP}/.well-known/oauth-protected-resource`
    );
  });

  it("describes the MCP server with docs and auth metadata", () => {
    const { linkset } = apiCatalogLinkset();
    const mcp = linkset.find((c) => c.anchor === `${APP}/api/mcp`);

    expect(mcp?.["service-doc"]?.[0].href).toBe(`${APP}/docs/mcp`);
    expect(mcp?.["service-meta"]?.[0].href).toBe(
      `${APP}/.well-known/oauth-protected-resource`
    );
  });
});
