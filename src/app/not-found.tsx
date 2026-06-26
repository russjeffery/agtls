import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { getPageViewer } from "@/lib/api/page-viewer";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";
const body = "var(--font-hanken, system-ui, sans-serif)";
const display = "var(--font-archivo, system-ui, sans-serif)";

const labelStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

export default async function NotFound() {
  const viewer = await getPageViewer();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-app)" }}>
      <AppHeader
        user={
          viewer ? { name: viewer.user.name, email: viewer.user.email } : null
        }
      />
      <div className="mx-auto max-w-[1360px] border-x-0 border-[var(--text-strong)] sm:border-x-2">
        <main>
          <section className="border-b-2 border-[var(--text-strong)] px-5 py-20 sm:px-10 sm:py-28">
            <span
              className="mb-7 inline-flex items-center gap-2.5"
              style={{ ...labelStyle, color: "var(--accent-hover)" }}
            >
              Error · 404
            </span>

            <h1
              style={{
                fontFamily: display,
                fontWeight: 840,
                fontVariationSettings: '"wdth" 118',
                textTransform: "uppercase",
                lineHeight: 0.9,
                letterSpacing: "-0.018em",
                color: "var(--text-strong)",
                margin: 0,
                fontSize: "clamp(3.25rem, 9vw, 9rem)",
              }}
            >
              Page not
              <br />
              <em style={{ fontStyle: "normal", color: "var(--ds-accent)" }}>
                found
              </em>
            </h1>

            <p
              className="mt-10 max-w-[48ch]"
              style={{
                fontFamily: body,
                fontSize: 19,
                lineHeight: 1.5,
                color: "var(--text-muted)",
              }}
            >
              The URL you requested doesn&rsquo;t map to anything here. The
              resource may have been removed, or the ID may be wrong.
            </p>

            <div className="mt-9 flex flex-wrap gap-3.5">
              <Link
                href="/"
                className="inline-flex items-center gap-2.5 border-2 px-[22px] py-[15px] transition-colors"
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  borderColor: "var(--text-strong)",
                  background: "var(--ds-accent)",
                  color: "var(--text-on-accent)",
                }}
              >
                Back home →
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center gap-2.5 border-2 px-[22px] py-[15px] transition-colors hover:bg-[var(--text-strong)] hover:text-[var(--bg-app)]"
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  borderColor: "var(--text-strong)",
                  color: "var(--text-strong)",
                }}
              >
                Read the API docs
              </Link>
            </div>
          </section>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
