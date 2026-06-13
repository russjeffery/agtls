import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  handleRegister,
  requestClaimLinkForCredential,
} from "@/lib/agent-auth/service";
import { AgentAuthError } from "@/lib/agent-auth/errors";
import { resolveAuth } from "@/lib/api/middleware";

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

async function getApiKeyId(
  apiKey: string | undefined | null,
  extra: { authInfo?: { token?: string } }
): Promise<string | null> {
  const token = apiKey ?? extra.authInfo?.token;
  if (!token) return null;
  const fakeRequest = new Request("https://internal/mcp", {
    headers: { authorization: `Bearer ${token}` },
  });
  const auth = await resolveAuth(fakeRequest);
  return auth?.apiKeyId ?? null;
}

export function registerTools(server: McpServer): void {
  // ── agent_register ──────────────────────────────────────────────────────────
  server.tool(
    "agent_register",
    "Register yourself with agtls to get your own API key, so the tasks, " +
      "webhooks, artifacts, and messages you create are saved to your own " +
      "account instead of being public. Call this once, save the returned " +
      "`credential`, and pass it as `api_key` on every subsequent tool call. " +
      "The returned `claim_link` is a page you can paste straight to your " +
      "human — they sign in and claim your work, moving it into their account.",
    {
      email: z
        .string()
        .email()
        .optional()
        .describe(
          "Your operator's email. When provided, agtls emails them an " +
            "approval link and withholds the credential until they confirm " +
            "(service_auth). Omit it to get a working credential immediately " +
            "(anonymous) plus a `claim_link` you can hand your human directly."
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
            "call so your work is owned by your account. To get a human to " +
            "take ownership, paste `claim_link` to them — they sign in and " +
            "claim you, no email needed. (`claim_token` supports the " +
            "alternative email/code claim flow.)",
        });
      } catch (e: unknown) {
        if (e instanceof AgentAuthError) return mcpError(e.message);
        return mcpError(
          e instanceof Error ? e.message : "Registration failed."
        );
      }
    }
  );

  // ── agent_request_claim_link ─────────────────────────────────────────────────
  server.tool(
    "agent_request_claim_link",
    "Generate a fresh link your human can open to claim you. Use this if you " +
      "registered earlier (anonymously) and didn't keep the `claim_link`, or " +
      "it expired. Pass your `api_key`. Paste the returned `claim_link` to " +
      "your human — they sign in and take ownership of your account and work.",
    {
      api_key: z
        .string()
        .optional()
        .describe("Your API key (the credential from agent_register)."),
    },
    async (args, extra) => {
      let apiKeyId: string | null;
      try {
        apiKeyId = await getApiKeyId(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }
      if (!apiKeyId) {
        return mcpError(
          "An API key is required. Register first with agent_register."
        );
      }
      try {
        const result = await requestClaimLinkForCredential(apiKeyId);
        return mcpOk({
          ...result,
          next_steps:
            "Paste `claim_link` to your human. When they sign in and confirm, " +
            "your account and all your work move into theirs.",
        });
      } catch (e: unknown) {
        if (e instanceof AgentAuthError) return mcpError(e.message);
        return mcpError(
          e instanceof Error ? e.message : "Could not create a claim link."
        );
      }
    }
  );
}
