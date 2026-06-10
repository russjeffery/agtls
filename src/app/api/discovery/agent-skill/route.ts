import { agentSkillMarkdown } from "@/lib/agent-auth/discovery";

// Served at /skill.md via a next.config rewrite. A copy-pasteable skill/prompt
// that lets an agent authenticate and use agtls with no human in the loop.
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(agentSkillMarkdown(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
