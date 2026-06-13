import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Make Cloudflare bindings (the D1 `DB` binding, vars from wrangler.jsonc /
// .dev.vars) available to getCloudflareContext() during `next dev`.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // libsql (used only by the E2E test database driver, src/lib/db/index.ts)
  // ships native binaries that break when bundled; keep it external so it
  // loads from node_modules. No-op in production, which never imports it.
  serverExternalPackages: ["@libsql/client"],

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
      {
        source: "/skill.md",
        destination: "/api/discovery/agent-skill",
      },
    ];
  },
};

export default nextConfig;
