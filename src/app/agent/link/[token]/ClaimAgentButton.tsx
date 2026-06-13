"use client";

import { useActionState } from "react";
import { claimAgentAction, type ClaimResult } from "./actions";

const initial: ClaimResult | null = null;

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export function ClaimAgentButton({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    async () => claimAgentAction(token),
    initial
  );

  if (state?.ok) {
    return (
      <div>
        <p
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: 16,
            color: "var(--text-strong)",
            margin: "0 0 16px",
            lineHeight: 1.6,
          }}
        >
          Claimed. This agent and everything it has created are now part of your
          account.
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
    <form action={formAction}>
      {state && !state.ok ? (
        <p
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: 14,
            color: "var(--danger-400)",
            margin: "0 0 16px",
          }}
        >
          {state.reason === "signed_out"
            ? "Your session expired. Refresh and sign in again to claim."
            : "This link is no longer available. Ask the agent for a new one."}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
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
        {pending ? "Claiming…" : "Claim this agent"}
      </button>
    </form>
  );
}
