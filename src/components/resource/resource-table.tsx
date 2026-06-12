"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export interface TableColumn {
  key: string;
  label: string;
  mono?: boolean;
  /** Map a cell value to a Badge variant, e.g. { high: "destructive" }. */
  badge?: Record<string, BadgeVariant>;
  align?: "left" | "right";
}

export interface TableRow {
  /** Where a click on the row navigates. Computed server-side. */
  href?: string;
  [key: string]: unknown;
}

function renderCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}

export function ResourceTable({
  rows,
  columns,
  emptyMessage = "No items yet.",
}: {
  rows: TableRow[];
  columns: TableColumn[];
  emptyMessage?: string;
}) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-8 text-center text-sm"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--line-1)",
          color: "var(--text-faint)",
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line-1)" }}>
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-4 py-2.5 uppercase"
                style={{
                  textAlign: c.align ?? "left",
                  fontFamily: mono,
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  fontWeight: 600,
                  color: "var(--text-faint)",
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={(row.id as string) ?? i}
              onClick={() => row.href && router.push(row.href)}
              className="transition-colors"
              style={{
                borderTop: i === 0 ? undefined : "1px solid var(--line-1)",
                cursor: row.href ? "pointer" : "default",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-well)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {columns.map((c) => {
                const value = row[c.key];
                const variant = c.badge && typeof value === "string" ? c.badge[value] : undefined;
                return (
                  <td
                    key={c.key}
                    className="px-4 py-3"
                    style={{
                      textAlign: c.align ?? "left",
                      fontFamily: c.mono ? mono : undefined,
                      fontSize: c.mono ? 12 : undefined,
                      color:
                        value === null || value === undefined || value === ""
                          ? "var(--text-faint)"
                          : "var(--text-strong)",
                    }}
                  >
                    {variant ? (
                      <Badge variant={variant}>{String(value)}</Badge>
                    ) : (
                      renderCell(value)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
