"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

/** Small inline copy-to-clipboard control used across the docs. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 transition-colors"
      style={{
        fontFamily: mono,
        fontSize: 11,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: copied ? "var(--ds-accent)" : "var(--text-faint)",
        background: "transparent",
        cursor: "pointer",
      }}
    >
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
      {copied ? "Copied" : label ?? "Copy"}
    </button>
  );
}
