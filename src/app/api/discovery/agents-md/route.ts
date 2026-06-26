import { agentsMarkdown } from "@/lib/agent-auth/discovery";

// Served at /agents.md via a next.config rewrite.
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(agentsMarkdown(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
