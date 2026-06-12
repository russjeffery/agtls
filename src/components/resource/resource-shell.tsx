import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";
const serif = "var(--font-newsreader, serif)";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Shared chrome for the browser-facing resource pages (/tasks, /webhooks, …):
 * sticky app header, a breadcrumb, and a page title. Mirrors the layout the old
 * content-negotiated HTML renderer produced, but built from the design system.
 */
export function ResourceShell({
  user,
  breadcrumb,
  title,
  objectType,
  description,
  children,
}: {
  user: { name: string; email: string } | null;
  breadcrumb: Crumb[];
  title: string;
  objectType?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-app)" }}>
      <AppHeader user={user} />
      <div className="mx-auto w-full px-5 py-10" style={{ maxWidth: 860 }}>
        <nav
          className="mb-4 flex flex-wrap items-center gap-1.5"
          style={{ fontFamily: mono, fontSize: 12 }}
        >
          {breadcrumb.map((c, i) => {
            const last = i === breadcrumb.length - 1;
            return (
              <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                {c.href && !last ? (
                  <Link
                    href={c.href}
                    className="no-underline transition-colors"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span style={{ color: last ? "var(--text-strong)" : "var(--text-muted)" }}>
                    {c.label}
                  </span>
                )}
                {!last && <span style={{ color: "var(--text-faint)" }}>/</span>}
              </span>
            );
          })}
        </nav>

        <h1
          className="m-0 mb-1.5 flex flex-wrap items-center gap-2.5"
          style={{
            fontFamily: serif,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--text-strong)",
          }}
        >
          {title}
          {objectType && <Badge variant="secondary">{objectType}</Badge>}
        </h1>
        {description && (
          <p
            className="m-0 mb-8"
            style={{ fontFamily: serif, fontSize: 15, color: "var(--text-muted)" }}
          >
            {description}
          </p>
        )}
        {!description && <div className="mb-8" />}

        {children}
      </div>
    </div>
  );
}
