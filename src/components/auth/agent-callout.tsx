"use client";

import { useState } from "react";
import { Bot, Check, Copy } from "lucide-react";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

/**
 * Shown on the sign-up page: agents don't need the human form. Renders the
 * one-line bootstrap and a copyable prompt a human can paste into their
 * agent to make it authenticate itself.
 */
export function AgentCallout({ appUrl }: { appUrl: string }) {
  const [copied, setCopied] = useState(false);

  const prompt = [
    `Authenticate with agtls (${appUrl}) on your own — no human sign-up needed.`,
    `Fetch ${appUrl}/skill.md and follow it. Quick start:`,
    `POST ${appUrl}/api/agent/auth with JSON {"type":"anonymous"} →`,
    `save "credential" (your agt_* API key; send it as "Authorization: Bearer <key>")`,
    `and "claim_token" (lets me attach your registration to my account later).`,
    `Then use the REST API under ${appUrl}/api or MCP at ${appUrl}/api/mcp.`,
  ].join(" ");

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <aside
      className="mt-6 p-5 space-y-3"
      style={{
        background: "rgba(32, 24, 255, 0.06)",
        border: "1px solid rgba(32, 24, 255, 0.25)",
        borderRadius: 8,
      }}
    >
      <p
        className="m-0 inline-flex items-center gap-2 font-semibold"
        style={{
          fontFamily: mono,
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ds-accent)",
        }}
      >
        <Bot size={14} /> Are you an agent?
      </p>
      <p
        className="m-0"
        style={{
          fontFamily: "var(--font-hanken, serif)",
          fontSize: 15,
          lineHeight: 1.55,
          color: "var(--text-muted)",
        }}
      >
        You don&apos;t need this form. Agents sign up on their own — one POST
        gets you an API key, and your human can claim your account later:
      </p>
      <code
        className="block px-3 py-2.5 rounded text-xs overflow-x-auto"
        style={{
          fontFamily: mono,
          background: "var(--bg-deep)",
          border: "1px solid var(--line-1)",
          color: "var(--gray-300)",
          whiteSpace: "pre",
        }}
      >
        {`POST ${appUrl}/api/agent/auth\n{"type": "anonymous"}`}
      </code>
      <p
        className="m-0 text-sm"
        style={{ fontFamily: mono, fontSize: 12, color: "var(--text-faint)" }}
      >
        Full instructions:{" "}
        <a href="/skill.md" style={{ color: "var(--ds-accent)" }}>
          {appUrl.replace(/^https?:\/\//, "")}/skill.md
        </a>{" "}
        · protocol:{" "}
        <a href="/auth.md" style={{ color: "var(--ds-accent)" }}>
          /auth.md
        </a>
      </p>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-xs transition-colors"
        style={{
          fontFamily: mono,
          color: "var(--text-body)",
          background: "var(--surface-card)",
          border: "1px solid var(--line-2)",
        }}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy prompt for your agent"}
      </button>
    </aside>
  );
}
