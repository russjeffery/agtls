import type { MetadataRoute } from "next";
import { apiCatalog } from "@/lib/docs/api-catalog";
import { mcpTools } from "@/lib/docs/mcp-catalog";

/**
 * Sitemap for crawlable, unauthenticated pages only.
 *
 * Auth-gated pages (account, dashboard, keys, organizations, device/*) redirect
 * to /sign-in and are deliberately excluded, as are the sign-in/sign-up utility
 * pages. The docs routes are enumerated from the same catalogs their pages use
 * (see docs/api/[slug] and docs/mcp/[tool]), so this stays in sync on its own.
 *
 * This runs at build time — it has no Request-time inputs, so Next.js renders it
 * to a static sitemap.xml during `next build`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://agtls.dev").replace(/\/$/, "");
  const lastModified = new Date();

  // Static public pages: marketing home, docs hubs, and the public resource tools.
  const staticPaths: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/docs", priority: 0.8, changeFrequency: "weekly" },
    { path: "/docs/api", priority: 0.8, changeFrequency: "weekly" },
    { path: "/docs/mcp", priority: 0.8, changeFrequency: "weekly" },
    { path: "/tasks", priority: 0.6, changeFrequency: "monthly" },
    { path: "/artifacts", priority: 0.6, changeFrequency: "monthly" },
    { path: "/messages", priority: 0.6, changeFrequency: "monthly" },
    { path: "/webhooks", priority: 0.6, changeFrequency: "monthly" },
  ];

  const apiDocPaths = apiCatalog().operations.map((op) => `/docs/api/${op.slug}`);
  const mcpDocPaths = (await mcpTools()).map((t) => `/docs/mcp/${t.name}`);

  return [
    ...staticPaths.map(({ path, priority, changeFrequency }) => ({
      url: `${baseUrl}${path}`,
      lastModified,
      changeFrequency,
      priority,
    })),
    ...[...apiDocPaths, ...mcpDocPaths].map((path) => ({
      url: `${baseUrl}${path}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
