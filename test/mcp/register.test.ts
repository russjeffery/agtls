import { describe, it, expect } from "vitest";
import { registerTools } from "@/lib/mcp/tools/register";
import { sentEmails } from "../helpers/email";

// The MCP agent_auth tool wraps the same agent-auth registration the REST
// endpoint exposes, so an agent on MCP can get its own credential and stop
// creating only public resources. We exercise the tool by capturing the handler
// the way the MCP SDK would call it.

type ToolHandler = (
  args: Record<string, unknown>,
  extra: Record<string, unknown>
) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function captureAgentAuth(): ToolHandler {
  let handler: ToolHandler | undefined;
  const fakeServer = {
    tool: (name: string, _desc: string, _schema: unknown, cb: ToolHandler) => {
      if (name === "agent_auth") handler = cb;
    },
  };
  registerTools(fakeServer as never);
  if (!handler) throw new Error("agent_auth tool was not registered");
  return handler;
}

function parse(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe("MCP agent_auth tool — register", () => {
  it("anonymous (no email): returns a usable credential and a claim token", async () => {
    const agentAuth = captureAgentAuth();

    const result = await agentAuth({ action: "register" }, {});
    expect(result.isError).toBeFalsy();

    const body = parse(result);
    expect(body.registration_id).toMatch(/^reg_/);
    expect(body.registration_type).toBe("anonymous");
    expect(body.credential).toMatch(/^agt_/);
    expect(body.scopes).toEqual(["api.read"]);
    expect(body.claim_token).toMatch(/^clm_/);
    // The shareable link the agent hands to its human.
    expect(body.claim_link).toMatch(/\/agent\/link\/cvt_/);
    expect(body.next_steps).toBeTruthy();
    // Anonymous registration issues the credential up front — no email needed.
    expect(sentEmails()).toHaveLength(0);
  });

  it("with email: starts the service_auth ceremony, emails the user, withholds the credential", async () => {
    const agentAuth = captureAgentAuth();

    const result = await agentAuth({ action: "register", email: "operator@example.com" }, {});
    expect(result.isError).toBeFalsy();

    const body = parse(result);
    expect(body.registration_type).toBe("service_auth");
    expect(body.claim_token).toMatch(/^clm_/);
    // No credential until the user approves and the claim completes.
    expect(body.credential).toBeUndefined();
    expect(sentEmails()).toHaveLength(1);
  });
});

describe("MCP agent_auth tool — request_claim_link", () => {
  it("mints a fresh claim_link for an anonymous credential passed as api_key", async () => {
    const agentAuth = captureAgentAuth();

    const reg = parse(await agentAuth({ action: "register" }, {}));
    const result = await agentAuth(
      { action: "request_claim_link", api_key: reg.credential },
      {}
    );
    expect(result.isError).toBeFalsy();

    const body = parse(result);
    expect(body.claim_link).toMatch(/\/agent\/link\/cvt_/);
  });

  it("errors without an api_key", async () => {
    const agentAuth = captureAgentAuth();
    const result = await agentAuth({ action: "request_claim_link" }, {});
    expect(result.isError).toBe(true);
  });
});
