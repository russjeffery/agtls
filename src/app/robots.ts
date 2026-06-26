import type { MetadataRoute } from "next";

/**
 * robots.txt — points crawlers at the sitemap and keeps them out of the
 * auth-gated app surface and the JSON API. Generated at build time alongside
 * sitemap.ts.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://agtls.dev").replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/account",
        "/dashboard",
        "/keys",
        "/organizations",
        "/device/",
        "/sign-in",
        "/sign-up",
        "/agent/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
