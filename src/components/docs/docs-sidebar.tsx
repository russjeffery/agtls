"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { MethodBadge } from "./method-badge";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export interface NavLeaf {
  label: string;
  href: string;
  method?: string;
}

export interface NavSubgroup {
  label?: string;
  items: NavLeaf[];
}

export interface NavSection {
  title: string;
  href?: string;
  subgroups: NavSubgroup[];
}

function NavLink({ item, active }: { item: NavLeaf; active: boolean }) {
  return (
    <Link
      href={item.href}
      className="flex items-center gap-2 px-3 py-1.5 no-underline transition-colors"
      style={{
        borderLeft: `2px solid ${active ? "var(--ds-accent)" : "transparent"}`,
        background: active ? "var(--accent-fill)" : "transparent",
        color: active ? "var(--text-strong)" : "var(--text-muted)",
        fontSize: 13,
        lineHeight: 1.3,
      }}
    >
      {item.method && <MethodBadge method={item.method} size="sm" />}
      <span>{item.label}</span>
    </Link>
  );
}

function SectionTitle({ section, active }: { section: NavSection; active: boolean }) {
  const style: React.CSSProperties = {
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: "0.1em",
    fontWeight: 600,
    textTransform: "uppercase",
    color: active ? "var(--text-strong)" : "var(--text-faint)",
  };
  return section.href ? (
    <Link href={section.href} className="no-underline" style={style}>
      {section.title}
    </Link>
  ) : (
    <span style={style}>{section.title}</span>
  );
}

function Nav({ sections, pathname }: { sections: NavSection[]; pathname: string }) {
  return (
    <nav className="flex flex-col gap-7">
      {sections.map((section) => (
        <div key={section.title} className="flex flex-col gap-2">
          <div className="px-3">
            <SectionTitle section={section} active={pathname === section.href} />
          </div>
          {section.subgroups.map((sub, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              {sub.label && (
                <div
                  className="px-3 pt-1.5 pb-0.5 uppercase"
                  style={{
                    fontFamily: mono,
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    color: "var(--text-faint)",
                  }}
                >
                  {sub.label}
                </div>
              )}
              {sub.items.map((item) => (
                <NavLink
                  key={item.href + item.label}
                  item={item}
                  active={pathname === item.href}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </nav>
  );
}

/**
 * The docs left-hand navigation. Sticky on desktop; a slide-in drawer on small
 * screens. Active state is derived from the current path.
 */
export function DocsSidebar({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center gap-2 px-4 py-2"
        style={{
          fontFamily: mono,
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-body)",
          borderBottom: "1px solid var(--line-1)",
          width: "100%",
        }}
      >
        <Menu size={15} /> Docs menu
      </button>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:block shrink-0 overflow-y-auto"
        style={{
          width: 264,
          borderRight: "1px solid var(--line-1)",
          position: "sticky",
          top: 53,
          height: "calc(100vh - 53px)",
          padding: "28px 8px 40px",
        }}
      >
        <Nav sections={sections} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0"
            style={{ background: "color-mix(in oklab, var(--bg-deep) 70%, transparent)" }}
            onClick={() => setOpen(false)}
          />
          <aside
            className="relative overflow-y-auto"
            style={{
              width: 280,
              maxWidth: "85vw",
              background: "var(--bg-app)",
              borderRight: "2px solid var(--text-strong)",
              padding: "20px 8px 40px",
            }}
          >
            <div className="flex justify-end px-3 pb-3">
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
            <div onClick={() => setOpen(false)}>
              <Nav sections={sections} pathname={pathname} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
