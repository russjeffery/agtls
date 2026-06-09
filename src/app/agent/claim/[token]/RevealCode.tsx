"use client";

import { useActionState } from "react";
import { revealOtpAction, type RevealResult } from "./actions";

const initial: RevealResult | null = null;

export function RevealCode({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    async () => revealOtpAction(token),
    initial
  );

  if (state?.ok) {
    return (
      <>
        <p
          aria-label="one-time code"
          style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: 8,
            fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
            background: "var(--surface-card)",
            border: "1px solid var(--line-2)",
            borderRadius: 8,
            padding: "20px 0",
            textAlign: "center",
            color: "var(--ds-accent)",
            boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05)",
            margin: "0 0 16px",
          }}
        >
          {state.otp}
        </p>
        <p
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: 14,
            color: "var(--text-muted)",
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          Read this code back to the agent. It expires in 10 minutes. If you did
          not initiate this request, do not share it — no access is granted
          without the code.
        </p>
      </>
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
          This request is no longer available. Ask the agent to start a new one.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        style={{
          fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
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
        {pending ? "Generating…" : "Yes, show my one-time code"}
      </button>
    </form>
  );
}
