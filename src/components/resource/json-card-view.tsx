"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

/**
 * Client half of JsonCard: the collapsible card chrome and copy button. `html`
 * is shiki output produced by the JsonCard server component, so no highlighting
 * code ships to the browser.
 */
export function JsonCardView({ json, html }: { json: string; html: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <details
      className="json-card overflow-hidden rounded-xl"
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
        <span className="flex items-center gap-1.5">
          <ChevronRight size={13} strokeWidth={2.5} className="json-card-chevron" aria-hidden />
          Raw JSON
        </span>
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
      <div className="json-card-code" dangerouslySetInnerHTML={{ __html: html }} />
    </details>
  );
}
