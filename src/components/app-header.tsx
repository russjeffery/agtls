import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { ToolsMenu } from "@/components/tools-nav";
import { Logo } from "./logo";

const archivo = "var(--font-archivo, system-ui, sans-serif)";
const mono = "var(--font-spline-mono, ui-monospace, monospace)";

const navLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0 18px",
  borderLeft: "1px solid var(--line-1)",
  color: "var(--text-body)",
  textDecoration: "none",
  fontFamily: mono,
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

/**
 * Sticky datasheet header shared across the signed-in app (dashboard, keys,
 * account, and the resource pages). Mirrors the landing page identity:
 * concrete ground, heavy rules, Archivo wordmark, electric-blue action.
 */
export function AppHeader({
  user,
}: {
  user: { name: string; email: string } | null;
}) {
  return (
    <header
      className="sticky top-0 z-40 flex items-stretch"
      style={{
        borderBottom: "2px solid var(--text-strong)",
        background: "color-mix(in oklab, var(--bg-app) 86%, transparent)",
        backdropFilter: "blur(8px)",
      }}
    >
      <Link
        href="/"
        className="inline-flex items-center gap-2.5 no-underline"
        style={{
          padding: "15px 22px",
          borderRight: "2px solid var(--text-strong)",
          fontFamily: archivo,
          fontWeight: 800,
          fontSize: 20,
          letterSpacing: "0.01em",
          color: "var(--text-strong)",
        }}
      >
        <Logo height={40} />
        {/* <span
          aria-hidden
          style={{ width: 12, height: 12, background: "var(--ds-accent)" }}
        />
        AGTLS */}
      </Link>

      <nav className="flex items-stretch ml-auto" style={{ fontFamily: mono }}>
        <div
          className="flex items-stretch"
          style={{ borderLeft: "1px solid var(--line-1)" }}
        >
          <ToolsMenu />
        </div>
        <Link style={navLinkStyle} href="/docs">
          Docs
        </Link>
        <div
          className="flex items-center"
          style={{ padding: "0 16px", borderLeft: "2px solid var(--text-strong)" }}
        >
          {user ? (
            <AccountMenu user={user} />
          ) : (
            <a
              href="/sign-up"
              className="inline-flex items-center gap-1.5"
              style={{
                color: "var(--text-on-accent)",
                background: "var(--ds-accent)",
                textDecoration: "none",
                fontFamily: mono,
                fontSize: 12,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "9px 14px",
              }}
            >
              Get API key <ArrowRight size={13} />
            </a>
          )}
        </div>
      </nav>
    </header>
  );
}
