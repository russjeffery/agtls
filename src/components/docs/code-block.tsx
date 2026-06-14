import { highlightJson } from "@/lib/shiki";
import { CopyButton } from "./copy-button";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

/**
 * A non-collapsible code block with a copy button and an optional caption.
 * JSON is syntax-highlighted server-side via shiki; any other language renders
 * as plain monospace text (the Workers shiki bundle only carries the JSON
 * grammar — see src/lib/shiki.ts).
 */
export async function CodeBlock({
  code,
  lang = "json",
  caption,
}: {
  code: string;
  lang?: "json" | "text";
  caption?: string;
}) {
  const html = lang === "json" ? await highlightJson(code) : null;

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--line-1)" }}
      >
        <span
          className="uppercase"
          style={{
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: "0.08em",
            fontWeight: 600,
            color: "var(--text-faint)",
          }}
        >
          {caption ?? lang}
        </span>
        <CopyButton value={code} />
      </div>
      {html ? (
        <div className="json-card-code" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre
          className="m-0 overflow-x-auto"
          style={{
            padding: "12px 16px 16px",
            fontFamily: mono,
            fontSize: 12.5,
            lineHeight: 1.7,
            color: "var(--text-body)",
          }}
        >
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
