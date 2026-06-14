import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthContext } from "@/lib/api/middleware";
import { claimResource, ClaimError } from "@/lib/api/claim";
import { getAuth, mcpError, mcpOk } from "./shared";

// Mirrors POST /api/claim/{id} (see src/app/api/claim/[id]/route.ts).

export function claimTools(server: McpServer): void {
  server.tool(
    "claim",
    "Claim a publicly-created resource (task, webhook endpoint, artifact, or scheduled message) for your organization using the claim_token returned when it was created. Requires an API key — register via agent_auth if you don't have one.",
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
