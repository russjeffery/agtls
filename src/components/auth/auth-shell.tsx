import Link from "next/link";
import { Logo } from "@/components/logo";

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
          radial-gradient(700px 400px at 50% -5%, oklch(0.835 0.175 153 / 0.07), transparent 60%),
          var(--bg-app)
        `,
      }}
    >
      <Link href="/" className="inline-flex no-underline mb-10">
        <Logo height={26} />
      </Link>

      <div className="w-full" style={{ maxWidth: 420 }}>
        <h1
          className="text-center"
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: 34,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--text-strong)",
            margin: "0 0 8px",
          }}
        >
          {title}
        </h1>
        <p
          className="text-center"
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--text-muted)",
            margin: "0 0 28px",
          }}
        >
          {subtitle}
        </p>
        {children}
      </div>
    </div>
  );
}
