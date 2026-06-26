import { buildLlmsIndex } from "@/lib/docs/llms-text";

// /llms.txt — the llmstxt.org index: a concise, link-first map of the docs
// surface for LLMs. Generated from the same API + MCP catalogs as the docs UI.
// Static (no request-time inputs); the base URL tracks NEXT_PUBLIC_APP_URL at
// build time, exactly like sitemap.ts / robots.ts.
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://agtls.dev").replace(/\/$/, "");
  return new Response(await buildLlmsIndex(base), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
