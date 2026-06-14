"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { authClient } from "@/lib/auth/client";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

/** Top-right account dropdown shown on app pages when signed in. */
export function AccountMenu({ user }: { user: { name: string; email: string } }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  const initial = (user.name || user.email).charAt(0).toUpperCase();

  const itemStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "7px 10px",
    borderRadius: 6,
    fontSize: 13,
    fontFamily: mono,
    color: "var(--text-body)",
    textDecoration: "none",
    background: "transparent",
    border: "none",
    cursor: "pointer",
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="flex items-center gap-2 cursor-pointer rounded-full py-1 pl-1 pr-2.5 transition-colors"
        style={{
          background: open || hover ? "var(--surface-raised)" : "var(--surface-card)",
          border: `1px solid ${open || hover ? "var(--ds-accent)" : "var(--line-2)"}`,
        }}
      >
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
          style={{
            background: "var(--green-soft)",
            color: "var(--ds-accent)",
            fontFamily: mono,
          }}
        >
          {initial}
        </span>
        <span
          className="text-sm max-w-36 truncate"
          style={{ fontFamily: mono, color: "var(--text-body)" }}
        >
          {user.name}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2.5}
          aria-hidden
          className="transition-transform"
          style={{
            color: "var(--text-muted)",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 p-1.5"
          style={{
            top: "calc(100% + 8px)",
            minWidth: 220,
            background: "var(--surface-card)",
            border: "1px solid var(--line-2)",
            borderRadius: 8,
            boxShadow: "0 6px 18px rgba(21, 20, 15, 0.18)",
          }}
        >
          <div
            className="px-2.5 pt-2 pb-2.5 mb-1.5"
            style={{ borderBottom: "1px solid var(--line-1)" }}
          >
            <div
              className="text-sm font-semibold truncate"
              style={{ fontFamily: mono, color: "var(--text-strong)" }}
            >
              {user.name}
            </div>
            <div
              className="text-xs truncate"
              style={{ fontFamily: mono, color: "var(--text-faint)" }}
            >
              {user.email}
            </div>
          </div>
          <a href="/dashboard" role="menuitem" style={itemStyle} className="hover:brightness-125">
            Dashboard
          </a>
          <a href="/keys" role="menuitem" style={itemStyle} className="hover:brightness-125">
            API keys
          </a>
          <a href="/account" role="menuitem" style={itemStyle} className="hover:brightness-125">
            Account
          </a>
          <div className="h-px my-1.5" style={{ background: "var(--line-1)" }} />
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            style={{ ...itemStyle, color: "var(--red-400, #f87171)" }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
