import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default config: no incremental cache override. The app is API-first with
// dynamic pages, so ISR/regional caching (R2 incremental cache, DO queue)
// isn't needed; add overrides here if static regeneration ever matters.
export default {
  ...defineCloudflareConfig(),
  // Build with webpack instead of Turbopack: Turbopack duplicates the shared
  // server library graph (better-auth, drizzle, …) into every page's SSR
  // chunk, which blows the Worker past Cloudflare's compressed size limit.
  // Webpack dedupes those into shared chunks.
  buildCommand: "npx next build --webpack",
};
