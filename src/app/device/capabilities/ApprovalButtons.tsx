"use client";

import { useState, useTransition } from "react";
import { resolveApprovalAction, type ApprovalResult } from "./actions";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export function ApprovalButtons({
  agentId,
  code,
}: {
  agentId: string;
  code: string;
}) {
  const [result, setResult] = useState<ApprovalResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: "approve" | "deny") {
    startTransition(async () => {
      setResult(await resolveApprovalAction(agentId, code, action));
    });
  }

  if (result?.ok) {
    return (
      <div>
        <p
          style={{
            fontFamily: "var(--font-hanken, serif)",
            fontSize: 16,
            color: "var(--text-strong)",
            margin: "0 0 16px",
            lineHeight: 1.6,
          }}
        >
          {result.action === "approve"
            ? "Approved. The agent can now use the capabilities you granted. You can return to the agent."
            : "Denied. The agent was not granted access."}
        </p>
        <a
          href="/dashboard"
          style={{
            display: "inline-block",
            fontFamily: mono,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-on-accent)",
            background: "var(--ds-accent)",
            borderRadius: 6,
            padding: "11px 20px",
            textDecoration: "none",
          }}
        >
          Go to dashboard
        </a>
      </div>
    );
  }

  return (
    <div>
      {result && !result.ok ? (
        <p
          style={{
            fontFamily: "var(--font-hanken, serif)",
            fontSize: 14,
            color: "var(--danger-400)",
            margin: "0 0 16px",
          }}
        >
          {result.reason === "signed_out"
            ? "Your session expired. Refresh and sign in again to approve."
            : result.reason === "invalid_code"
              ? "That device code doesn't match this request. Check the code shown by the agent."
              : "This request is no longer available. Ask the agent to start again."}
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("approve")}
          style={{
            fontFamily: mono,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-on-accent)",
            background: pending ? "var(--green-600)" : "var(--ds-accent)",
            border: "none",
            borderRadius: 6,
            padding: "11px 20px",
            cursor: pending ? "not-allowed" : "pointer",
            transition: "background 200ms ease",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Working…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("deny")}
          style={{
            fontFamily: mono,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-body)",
            background: "var(--surface-card)",
            border: "1px solid var(--line-2)",
            borderRadius: 6,
            padding: "11px 20px",
            cursor: pending ? "not-allowed" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          Deny
        </button>
      </div>
    </div>
  );
}
