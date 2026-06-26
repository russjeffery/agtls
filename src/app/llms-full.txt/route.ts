import { buildLlmsFull } from "@/lib/docs/llms-text";

// /llms-full.txt — the full LLM-facing reference: agent-auth narrative plus
// every REST operation and MCP tool with full schemas, generated from the
// catalogs so it never drifts from the API. Static, like /llms.txt.
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://agtls.dev").replace(/\/$/, "");
  return new Response(await buildLlmsFull(base), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
