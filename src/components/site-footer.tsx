import Link from "next/link";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";
const body = "var(--font-hanken, system-ui, sans-serif)";
const display = "var(--font-archivo, system-ui, sans-serif)";

const GITHUB = "https://github.com/russjeffery/agtls";

const labelStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

/**
 * Datasheet footer shared across the landing page and the 404 page. Mirrors the
 * site identity: concrete ground, heavy rules, Archivo wordmark.
 */
export function SiteFooter() {
  const headStyle: React.CSSProperties = {
    ...labelStyle,
    color: "var(--text-muted)",
    marginBottom: 16,
  };
  const linkStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 10,
    fontFamily: mono,
    fontSize: 13,
    color: "var(--text-strong)",
    textDecoration: "none",
  };
  const linkClass = "transition-colors hover:text-[var(--accent-hover)]";
  const cell = "border-b border-r border-[var(--line-1)] p-10";
  return (
    <footer
      className="grid grid-cols-1 overflow-hidden sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]"
      style={{ background: "var(--bg-deep)" }}
    >
      <div className={cell}>
        <div
          style={{
            fontFamily: display,
            fontWeight: 800,
            fontVariationSettings: '"wdth" 112',
            fontSize: 24,
            textTransform: "uppercase",
            color: "var(--text-strong)",
          }}
        >
          AGTLS
        </div>
        <p
          className="mt-3.5 max-w-[30ch]"
          style={{ fontFamily: body, fontSize: 14, color: "var(--text-muted)" }}
        >
          Open infrastructure for AI agents.
        </p>
      </div>
      <div className={cell}>
        <div style={headStyle}>Product</div>
        <a className={linkClass} style={linkStyle} href="/#tools">
          Tools
        </a>
        <Link className={linkClass} style={linkStyle} href="/dashboard">
          Dashboard
        </Link>
      </div>
      <div className={cell}>
        <div style={headStyle}>Developers</div>
        <a className={linkClass} style={linkStyle} href="/api">
          API reference
        </a>
        <a className={linkClass} style={linkStyle} href="/api/openapi.json">
          OpenAPI spec
        </a>
      </div>
      <div className={cell}>
        <div style={headStyle}>For agents</div>
        <a className={linkClass} style={linkStyle} href="/agents.md">
          agents.md
        </a>
        <a className={linkClass} style={linkStyle} href="/llms.txt">
          llms.txt
        </a>
        <a className={linkClass} style={linkStyle} href="/api/openapi.json">
          OpenAPI spec
        </a>
        <a className={linkClass} style={linkStyle} href="/auth.md">
          Sign up / Register
        </a>
      </div>
      <div className={cell}>
        <div style={headStyle}>Project</div>
        <a className={linkClass} style={linkStyle} href={GITHUB}>
          GitHub
        </a>
        <a
          className={linkClass}
          style={linkStyle}
          href={`${GITHUB}/blob/main/LICENSE`}
        >
          License
        </a>
      </div>
    </footer>
  );
}
