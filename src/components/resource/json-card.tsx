"use client";

import { useState } from "react";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

/**
 * Collapsible "raw JSON" card with a copy button — the API representation of a
 * resource, for users who want to see exactly what an agent receives.
 */
export function JsonCard({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const copy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <details
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
    >
      <summary
        className="flex cursor-pointer items-center justify-between px-4 py-3 uppercase select-none"
        style={{
          fontFamily: mono,
          fontSize: 11,
          letterSpacing: "0.08em",
          fontWeight: 600,
          color: "var(--text-faint)",
        }}
      >
        Raw JSON
        <span
          role="button"
          onClick={(e) => {
            e.preventDefault();
            copy();
          }}
          style={{ color: "var(--ds-accent)", textTransform: "none", letterSpacing: 0 }}
        >
          {copied ? "Copied!" : "Copy"}
        </span>
      </summary>
      <pre
        className="overflow-x-auto px-4 pb-4"
        style={{ fontFamily: mono, fontSize: 12.5, lineHeight: 1.7, color: "var(--text-strong)", margin: 0 }}
      >
        {json}
      </pre>
    </details>
  );
}
