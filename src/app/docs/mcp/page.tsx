import type { Metadata } from "next";
import Link from "next/link";
import { DocContainer, DocHeader, DocSection, Prose } from "@/components/docs/doc-content";
import { CodeBlock } from "@/components/docs/code-block";
import { CopyButton } from "@/components/docs/copy-button";
import { mcpToolGroups, mcpUrl } from "@/lib/docs/mcp-catalog";

export const metadata: Metadata = {
  title: "MCP Server — agtls docs",
  description: "Connect your agent to the agtls Model Context Protocol server and use its tools.",
};

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export default async function McpOverviewPage() {
  const url = mcpUrl();
  const groups = await mcpToolGroups();
  const toolCount = groups.reduce((n, g) => n + g.tools.length, 0);

  const config = JSON.stringify(
    {
      mcpServers: {
        agtls: {
          url,
          headers: { Authorization: "Bearer agt_live_…" }, // optional
        },
      },
    },
    null,
    2
  );

  return (
    <DocContainer>
      <DocHeader
        eyebrow="MCP Server"
        title="MCP server"
        lead={`A Model Context Protocol endpoint exposing ${toolCount} tools — the same tasks, webhooks, artifacts, and messages as the REST API. Connect your agent and it can register itself, then create and manage resources directly.`}
      />

      <DocSection title="Endpoint">
        <div
          className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
          style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
        >
          <code style={{ fontFamily: mono, fontSize: 14, color: "var(--text-strong)" }}>
            {url}
          </code>
          <CopyButton value={url} />
        </div>
        <Prose>
          <p className="mb-0">
            Streamable HTTP transport. The server is stateless — each request is
            independent — and accepts <code>GET</code>, <code>POST</code>, and{" "}
            <code>DELETE</code>.
          </p>
        </Prose>
      </DocSection>

      <DocSection title="Authentication">
        <Prose>
          <p className="mt-0">
            Auth is optional, mirroring the REST API. There are two ways to
            authenticate:
          </p>
          <ul style={{ paddingLeft: 18, margin: "0 0 12px" }}>
            <li style={{ marginBottom: 6 }}>
              Send an <code>Authorization: Bearer agt_live_…</code> header on the
              MCP connection, or
            </li>
            <li>
              Pass an <code>api_key</code> argument to any individual tool call.
            </li>
          </ul>
          <p className="mb-0">
            Without a key, tools operate anonymously: created resources are public
            and return a <code>claim_token</code>. No key yet? Call the{" "}
            <Link href="/docs/mcp/agent_auth">
              <code>agent_auth</code>
            </Link>{" "}
            tool (<code>action: register</code>) to mint one, then pass it as{" "}
            <code>api_key</code> on every subsequent call.
          </p>
        </Prose>
      </DocSection>

      <DocSection title="Client configuration">
        <Prose>
          <p className="mt-0">
            Most MCP clients accept a server config like this (the{" "}
            <code>headers</code> block is optional):
          </p>
        </Prose>
        <CodeBlock caption="mcp config" code={config} />
      </DocSection>

      <DocSection title="Tools">
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.name}>
              <div
                className="mb-2 uppercase"
                style={{
                  fontFamily: mono,
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  color: "var(--text-faint)",
                }}
              >
                {group.label}
              </div>
              <div
                className="overflow-hidden rounded-xl"
                style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
              >
                {group.tools.map((tool, i) => (
                  <Link
                    key={tool.name}
                    href={`/docs/mcp/${tool.name}`}
                    className="block px-4 py-3 no-underline transition-colors hover:bg-[var(--surface-raised)]"
                    style={{ borderTop: i === 0 ? undefined : "1px solid var(--line-1)" }}
                  >
                    <code
                      style={{
                        fontFamily: mono,
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "var(--text-strong)",
                      }}
                    >
                      {tool.name}
                    </code>
                    <p
                      className="mt-1 mb-0"
                      style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.5 }}
                    >
                      {tool.description}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DocSection>
    </DocContainer>
  );
}
