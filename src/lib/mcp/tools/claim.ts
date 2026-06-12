import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveAuth } from "@/lib/api/middleware";
import type { AuthContext } from "@/lib/api/middleware";
import { claimResource, ClaimError } from "@/lib/api/claim";

// Mirrors POST /api/claim/{id} (see src/app/api/claim/[id]/route.ts).

async function getAuth(
  apiKey: string | undefined | null,
  extra: { authInfo?: { token?: string } }
): Promise<AuthContext | null> {
  const token = apiKey ?? extra.authInfo?.token;
  if (!token) return null;

  const fakeRequest = new Request("https://internal/mcp", {
    headers: { authorization: `Bearer ${token}` },
  });
  return resolveAuth(fakeRequest);
}

function mcpError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

function mcpOk(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

export function claimTools(server: McpServer): void {
  server.tool(
    "claim",
    "Claim a publicly-created resource (task, webhook endpoint, artifact, or scheduled message) for your organization using the claim_token returned when it was created. Requires an API key — register via the agent auth flow if you don't have one.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Resource ID (tsk_..., wh_..., art_..., or msg_...)"),
      claim_token: z
        .string()
        .min(1)
        .describe("Claim token (clm_...) returned when the resource was created"),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      if (!auth) {
        return mcpError(
          "Claiming a resource requires an API key so it can be assigned to your organization."
        );
      }

      try {
        const result = await claimResource(args.id, args.claim_token, auth.organizationId);
        return mcpOk(result.data);
      } catch (e: unknown) {
        if (e instanceof ClaimError) return mcpError(e.message);
        throw e;
      }
    }
  );
}
