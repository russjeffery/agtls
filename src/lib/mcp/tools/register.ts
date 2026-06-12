import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleRegister } from "@/lib/agent-auth/service";
import { AgentAuthError } from "@/lib/agent-auth/errors";

// MCP front door for agent self-registration. Without this, an agent reaching
// agtls over MCP can only create *public* resources (no credential => no owning
// org), so its work isn't saved to an account. This tool wraps the same
// registration the REST endpoint exposes (POST /api/agent/auth) so an agent can
// obtain its own credential and keep working under it — all over MCP.

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

export function registerTools(server: McpServer): void {
  // ── agent_register ──────────────────────────────────────────────────────────
  server.tool(
    "agent_register",
    "Register yourself with agtls to get your own API key, so the tasks, " +
      "webhooks, artifacts, and messages you create are saved to your own " +
      "account instead of being public. Call this once, save the returned " +
      "`credential`, and pass it as `api_key` on every subsequent tool call. " +
      "The `claim_token` lets a human take ownership of your work later — give " +
      "it to your operator along with their email.",
    {
      email: z
        .string()
        .email()
        .optional()
        .describe(
          "Your operator's email. When provided, agtls emails them an " +
            "approval link and withholds the credential until they confirm " +
            "(service_auth). Omit it to get a working credential immediately " +
            "(anonymous) that a human can claim later."
        ),
    },
    async (args) => {
      try {
        if (args.email) {
          const result = await handleRegister(
            { type: "service_auth", login_hint: args.email },
            { ip: null }
          );
          return mcpOk({
            ...result,
            next_steps:
              "Your operator was emailed an approval link. Once they confirm " +
              "and read you the one-time code, complete the claim to receive " +
              "your credential.",
          });
        }

        const result = await handleRegister(
          { type: "anonymous" },
          { ip: null }
        );
        return mcpOk({
          ...result,
          next_steps:
            "Save `credential` and pass it as `api_key` on every other tool " +
            "call so your work is owned by your account. Keep `claim_token` " +
            "private — a human can use it with their email to take ownership.",
        });
      } catch (e: unknown) {
        if (e instanceof AgentAuthError) return mcpError(e.message);
        return mcpError(
          e instanceof Error ? e.message : "Registration failed."
        );
      }
    }
  );
}
