const mono = "var(--font-spline-mono, ui-monospace, monospace)";

// HTTP method → accent color. Reads from the design tokens so it stays on-theme.
const METHOD_COLORS: Record<string, string> = {
  GET: "var(--info-400)",
  POST: "var(--green-600)",
  PUT: "var(--amber-500)",
  PATCH: "var(--amber-500)",
  DELETE: "var(--danger-400)",
};

/** A square datasheet pill carrying an HTTP method. */
export function MethodBadge({
  method,
  size = "md",
}: {
  method: string;
  size?: "sm" | "md";
}) {
  const m = method.toUpperCase();
  const color = METHOD_COLORS[m] ?? "var(--text-muted)";
  return (
    <span
      className="inline-flex items-center justify-center"
      style={{
        fontFamily: mono,
        fontSize: size === "sm" ? 10 : 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        lineHeight: 1,
        padding: size === "sm" ? "3px 5px" : "4px 7px",
        color,
        border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
        minWidth: size === "sm" ? 42 : 52,
      }}
    >
      {m}
    </span>
  );
}
