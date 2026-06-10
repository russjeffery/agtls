import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { AccountMenu } from "@/components/account-menu";

const NAV_LINKS = [
  { label: "Tasks", href: "/api/tasks" },
  { label: "Webhooks", href: "/api/webhooks" },
  { label: "Orgs", href: "/api/organizations" },
];

/**
 * Sticky site header for app pages (dashboard, keys, account). Shows the
 * account dropdown when signed in, sign-in/sign-up otherwise.
 */
export function AppHeader({
  user,
}: {
  user: { name: string; email: string } | null;
}) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-7 px-8 py-3.5 border-b"
      style={{
        background: "oklch(0.168 0.006 248 / 0.72)",
        backdropFilter: "blur(14px)",
        borderColor: "var(--line-1)",
        fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
      }}
    >
      <Link href="/" className="inline-flex no-underline">
        <Logo height={36} />
      </Link>
      <nav className="flex gap-5 ml-3">
        {NAV_LINKS.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="text-sm transition-colors no-underline"
            style={{ color: "var(--text-muted)" }}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-5">
        {user ? (
          <AccountMenu user={user} />
        ) : (
          <>
            <a
              href="/sign-in"
              className="text-sm no-underline transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              Sign in
            </a>
            <a
              href="/sign-up"
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded no-underline transition-colors"
              style={{
                background: "var(--ds-accent)",
                color: "var(--text-on-accent)",
              }}
            >
              Get API key <ArrowRight size={14} />
            </a>
          </>
        )}
      </div>
    </header>
  );
}
