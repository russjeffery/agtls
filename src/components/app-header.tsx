import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { ToolsMenu } from "@/components/tools-nav";
import { Logo } from "./logo";

const archivo = "var(--font-archivo, system-ui, sans-serif)";
const mono = "var(--font-spline-mono, ui-monospace, monospace)";

const navLinkStyle: React.CSSProperties = {
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
        className="inline-flex items-center gap-2.5 no-underline px-2.5 py-2 sm:px-[22px] sm:py-[15px]"
        style={{
          borderRight: "2px solid var(--text-strong)",
          fontFamily: archivo,
          fontWeight: 800,
          fontSize: 20,
          letterSpacing: "0.01em",
          color: "var(--text-strong)",
        }}
      >
        <span className="inline-flex sm:hidden">
          <Logo height={20} />
        </span>
        <span className="hidden sm:inline-flex">
          <Logo height={40} />
        </span>
      </Link>

      <nav
        className="flex min-w-0 items-stretch ml-auto"
        style={{ fontFamily: mono }}
      >
        <div
          className="flex items-stretch"
          style={{ borderLeft: "1px solid var(--line-1)" }}
        >
          <ToolsMenu />
        </div>
        <Link
          className="hidden items-center px-3 sm:inline-flex sm:px-[18px]"
          style={navLinkStyle}
          href="/docs"
        >
          Docs
        </Link>
        <div
          className="flex items-center px-2 sm:px-4"
          style={{ borderLeft: "2px solid var(--text-strong)" }}
        >
          {user ? (
            <AccountMenu user={user} />
          ) : (
            <a
              href="/sign-up"
              className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 sm:px-3.5"
              style={{
                color: "var(--text-on-accent)",
                background: "var(--ds-accent)",
                textDecoration: "none",
                fontFamily: mono,
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <span className="sm:hidden">Get key</span>
              <span className="hidden sm:inline">Get API key</span>
              <ArrowRight size={13} />
            </a>
          )}
        </div>
      </nav>
    </header>
  );
}
