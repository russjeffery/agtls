import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  handleRegister,
  requestClaimLinkForCredential,
} from "@/lib/agent-auth/service";
import { AgentAuthError } from "@/lib/agent-auth/errors";
import { getAuth, mcpError, mcpOk } from "./shared";

// MCP front door for agent self-registration. Without this, an agent reaching
// agtls over MCP can only create *public* resources (no credential => no owning
// org), so its work isn't saved to an account. This tool wraps the same
// registration the REST endpoint exposes (POST /api/agent/auth) so an agent can
// obtain its own credential and keep working under it — all over MCP.

export function registerTools(server: McpServer): void {
  server.tool(
    "agent_auth",
    "Manage your agtls credential. `action: register` gets you your own API key " +
      "so the tasks, webhooks, artifacts, and messages you create are saved to " +
      "your own account instead of being public — call it once, save the returned " +
      "`credential`, and pass it as `api_key` on every subsequent tool call. The " +
      "returned `claim_link` is a page you can paste straight to your human; they " +
      "sign in and claim your work into their account. `action: request_claim_link` " +
      "mints a fresh `claim_link` for an existing credential (pass `api_key`) if you " +
      "lost the original or it expired.",
    {
      action: z
        .enum(["register", "request_claim_link"])
        .describe("`register` to get a new credential; `request_claim_link` for a fresh claim link."),
      api_key: z
        .string()
        .optional()
        .describe("Your API key (the credential from a prior register). Required for request_claim_link."),
      email: z
        .string()
        .email()
        .optional()
        .describe(
          "register only: your operator's email. When provided, agtls emails them " +
            "an approval link and withholds the credential until they confirm " +
            "(service_auth). Omit it to get a working credential immediately " +
            "(anonymous) plus a `claim_link` you can hand your human directly."
        ),
    },
    async (args, extra) => {
      // ── request_claim_link ──
      if (args.action === "request_claim_link") {
        let apiKeyId: string | null;
        try {
          const auth = await getAuth(args.api_key, extra);
          apiKeyId = auth?.apiKeyId ?? null;
        } catch (e: unknown) {
          return mcpError(e instanceof Error ? e.message : "Invalid API key.");
        }
        if (!apiKeyId) {
          return mcpError(
            "An API key is required. Register first with agent_auth action=register."
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
          return mcpError(e instanceof Error ? e.message : "Could not create a claim link.");
        }
      }

      // ── register ──
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

        const result = await handleRegister({ type: "anonymous" }, { ip: null });
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
        return mcpError(e instanceof Error ? e.message : "Registration failed.");
      }
    }
  );
}
