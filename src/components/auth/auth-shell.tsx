import Link from "next/link";

/** Centered single-column chrome shared by the sign-in and sign-up pages. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col items-center px-5 py-14"
      style={{
        background: `
          radial-gradient(700px 400px at 50% -5%, rgba(32, 24, 255, 0.08), transparent 60%),
          var(--bg-app)
        `,
      }}
    >
      <Link
        href="/"
        className="inline-flex items-center gap-2.5 no-underline mb-10"
        style={{
          fontFamily: "var(--font-archivo, system-ui, sans-serif)",
          fontWeight: 800,
          fontSize: 20,
          letterSpacing: "0.01em",
          color: "var(--text-strong)",
        }}
      >
        <span
          aria-hidden
          style={{ width: 12, height: 12, background: "var(--ds-accent)" }}
        />
        AGTLS
      </Link>

      <div
        className="w-full"
        style={{
          maxWidth: 420,
          border: "2px solid var(--text-strong)",
          background: "var(--surface-card)",
          padding: 28,
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-archivo, system-ui, sans-serif)",
            fontSize: 38,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            color: "var(--text-strong)",
            margin: "0 0 8px",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontFamily: "var(--font-hanken, sans-serif)",
            fontSize: 15.5,
            lineHeight: 1.5,
            color: "var(--text-muted)",
            margin: "0 0 26px",
          }}
        >
          {subtitle}
        </p>
        {children}
      </div>
    </div>
  );
}
