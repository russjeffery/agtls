const mono = "var(--font-spline-mono, ui-monospace, monospace)";
const display = "var(--font-archivo, system-ui, sans-serif)";

/** Centered, readable-width content column for a docs page. */
export function DocContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full px-6 py-12" style={{ maxWidth: 780 }}>
      {children}
    </div>
  );
}

/** Page header: small mono eyebrow, big display title, muted lead paragraph. */
export function DocHeader({
  eyebrow,
  title,
  lead,
  aside,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <header className="mb-9">
      {eyebrow && (
        <div
          className="mb-3 uppercase"
          style={{
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: "0.14em",
            color: "var(--text-faint)",
          }}
        >
          {eyebrow}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h1
          className="m-0"
          style={{
            fontFamily: display,
            fontSize: 38,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            color: "var(--text-strong)",
          }}
        >
          {title}
        </h1>
        {aside}
      </div>
      {lead && (
        <p
          className="mt-3 mb-0"
          style={{ fontSize: 16, lineHeight: 1.55, color: "var(--text-muted)" }}
        >
          {lead}
        </p>
      )}
    </header>
  );
}

/** A titled section with a mono uppercase heading. */
export function DocSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9">
      <h2
        className="m-0 mb-3 uppercase"
        style={{
          fontFamily: mono,
          fontSize: 12,
          letterSpacing: "0.1em",
          fontWeight: 600,
          color: "var(--text-faint)",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Body copy with sensible spacing for paragraphs and inline code. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ fontSize: 15, lineHeight: 1.65, color: "var(--text-body)" }}
      className="docs-prose"
    >
      {children}
    </div>
  );
}
