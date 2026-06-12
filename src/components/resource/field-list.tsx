const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export interface Field {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

/** A labelled field card for resource detail pages. */
export function FieldList({ fields, title }: { fields: Field[]; title?: string }) {
  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
    >
      {title && (
        <div
          className="px-4 py-3 uppercase"
          style={{
            fontFamily: mono,
            fontSize: 11,
            letterSpacing: "0.08em",
            fontWeight: 600,
            color: "var(--text-faint)",
            borderBottom: "1px solid var(--line-1)",
          }}
        >
          {title}
        </div>
      )}
      <dl className="m-0">
        {fields.map((f, i) => (
          <div
            key={f.label}
            className="flex gap-4 px-4 py-2.5"
            style={{ borderTop: i === 0 ? undefined : "1px solid var(--line-1)" }}
          >
            <dt
              className="uppercase"
              style={{
                width: 140,
                flexShrink: 0,
                fontFamily: mono,
                fontSize: 11,
                letterSpacing: "0.06em",
                color: "var(--text-faint)",
                paddingTop: 2,
              }}
            >
              {f.label}
            </dt>
            <dd
              className="m-0 min-w-0 break-words"
              style={{
                fontFamily: f.mono ? mono : "var(--font-newsreader, serif)",
                fontSize: f.mono ? 13 : 15,
                color:
                  f.value === null || f.value === undefined || f.value === ""
                    ? "var(--text-faint)"
                    : "var(--text-strong)",
              }}
            >
              {f.value === null || f.value === undefined || f.value === "" ? "—" : f.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
