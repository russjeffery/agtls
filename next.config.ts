import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (used only by the E2E test database driver, src/lib/db/index.ts)
  // ships WASM/data assets that break when bundled; keep it external so it loads
  // from node_modules with its asset paths intact. No-op in production, which
  // never imports it.
  serverExternalPackages: ["@electric-sql/pglite"],

  // Discovery documents must live at the origin root. The App Router does not
  // reliably serve dot-prefixed path segments (e.g. `.well-known`), so the
  // handlers live under /api/discovery/* and are surfaced at their canonical
  // public paths via rewrites.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/discovery/protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/discovery/authorization-server",
      },
      {
        source: "/auth.md",
        destination: "/api/discovery/auth-md",
      },
    ];
  },
};

export default nextConfig;
