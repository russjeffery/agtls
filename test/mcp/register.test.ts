import { describe, it, expect } from "vitest";
import { registerTools } from "@/lib/mcp/tools/register";
import { sentEmails } from "../helpers/email";

// The MCP register tool wraps the same agent-auth registration the REST endpoint
// exposes, so an agent on MCP can get its own credential and stop creating only
// public resources. We exercise the tool by capturing the handler the way the
// MCP SDK would call it.

type ToolHandler = (
  args: Record<string, unknown>,
  extra: Record<string, unknown>
) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function captureRegisterTool(): ToolHandler {
  const handlers = new Map<string, ToolHandler>();
  const fakeServer = {
    tool: (name: string, _desc: string, _schema: unknown, cb: ToolHandler) => {
      handlers.set(name, cb);
    },
  };
  registerTools(fakeServer as never);
  const handler = handlers.get("agent_register");
  if (!handler) throw new Error("agent_register tool was not registered");
  return handler;
}

function parse(result: { content: { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe("MCP agent_register tool", () => {
  it("anonymous (no email): returns a usable credential and a claim token", async () => {
    const register = captureRegisterTool();

    const result = await register({}, {});
    expect(result.isError).toBeFalsy();

    const body = parse(result);
    expect(body.registration_id).toMatch(/^reg_/);
    expect(body.registration_type).toBe("anonymous");
    expect(body.credential).toMatch(/^agt_/);
    expect(body.scopes).toEqual(["api.read"]);
    expect(body.claim_token).toMatch(/^clm_/);
    expect(body.next_steps).toBeTruthy();
    // Anonymous registration issues the credential up front — no email needed.
    expect(sentEmails()).toHaveLength(0);
  });

  it("with email: starts the service_auth ceremony, emails the user, withholds the credential", async () => {
    const register = captureRegisterTool();

    const result = await register({ email: "operator@example.com" }, {});
    expect(result.isError).toBeFalsy();

    const body = parse(result);
    expect(body.registration_type).toBe("service_auth");
    expect(body.claim_token).toMatch(/^clm_/);
    // No credential until the user approves and the claim completes.
    expect(body.credential).toBeUndefined();
    expect(sentEmails()).toHaveLength(1);
  });
});
