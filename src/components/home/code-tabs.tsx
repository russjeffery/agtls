"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";
const body = "var(--font-hanken, system-ui, sans-serif)";

export type CodeTab = {
  /** Stable key + accessible label. */
  id: string;
  /** Short label shown on the tab strip. */
  label: string;
  /** Pre-highlighted `<pre>…</pre>` HTML, or `null` for plain text. */
  html: string | null;
  /** Raw text to render when `html` is null, and to copy to the clipboard. */
  code: string;
  /** Optional one-line note shown under the tab strip. */
  note?: string;
};

/**
 * Tabbed code panel for the home hero: cURL / MCP / agent prompt. Each tab's
 * snippet is syntax-highlighted server-side (see src/lib/shiki.ts) and passed
 * in as HTML; this client component only owns the active-tab state and the
 * copy-to-clipboard control.
 */
export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const current = tabs[active];

  const copy = () => {
    navigator.clipboard.writeText(current.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const select = (i: number) => {
    setActive(i);
    setCopied(false);
  };

  return (
    <div
      className="flex flex-1 flex-col"
      style={{ background: "var(--surface-card)" }}
    >
      <div
        role="tablist"
        aria-label="Ways to call agtls"
        className="flex items-stretch border-b-2 border-[var(--text-strong)]"
      >
        {tabs.map((tab, i) => {
          const selected = i === active;
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => select(i)}
              className="border-r border-[var(--line-1)] px-[14px] py-3 transition-colors"
              style={{
                fontFamily: mono,
                fontSize: 11,
                fontWeight: selected ? 700 : 500,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                background: selected ? "var(--ds-accent)" : "transparent",
                color: selected
                  ? "var(--text-on-accent)"
                  : "var(--text-muted)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={copy}
          aria-label="Copy to clipboard"
          className="ml-auto inline-flex items-center gap-1.5 border-l border-[var(--line-1)] px-[14px] py-3 transition-colors"
          style={{
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: copied ? "var(--ds-accent)" : "var(--text-muted)",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          {copied ? (
            <Check size={12} strokeWidth={2.5} />
          ) : (
            <Copy size={12} strokeWidth={2} />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {current.note ? (
        <p
          className="m-0 border-b border-[var(--line-1)] px-[18px] py-2.5"
          style={{
            fontFamily: body,
            fontSize: 12.5,
            lineHeight: 1.45,
            color: "var(--text-muted)",
          }}
        >
          {current.note}
        </p>
      ) : null}

      <div role="tabpanel" className="flex-1">
        {current.html ? (
          <div
            className="code-tabs-code"
            dangerouslySetInnerHTML={{ __html: current.html }}
          />
        ) : (
          <pre
            className="m-0 h-full overflow-x-auto whitespace-pre-wrap px-[18px] py-[22px]"
            style={{
              fontFamily: mono,
              fontSize: 13,
              lineHeight: 1.75,
              color: "var(--text-strong)",
            }}
          >
            <code>{current.code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
