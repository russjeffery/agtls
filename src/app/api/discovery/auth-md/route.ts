import { authMarkdown } from "@/lib/agent-auth/discovery";

// Served at /auth.md via a next.config rewrite.
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(authMarkdown(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
