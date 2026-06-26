import { resolveSchemaRef, type JSONSchema } from "@/lib/docs/api-catalog";
import { flatten, typeLabel, expandable } from "@/lib/docs/schema-shape";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

// Schema shaping (flatten / typeLabel / expandable) lives in schema-shape.ts so
// the plain-text /llms-full.txt renderer shares it. This file is the visual
// (datasheet-table) renderer.

// ─── Rendering ─────────────────────────────────────────────────────────────

function PropertyRow({
  name,
  schema,
  required,
  depth,
  visited,
}: {
  name: string;
  schema: JSONSchema;
  required: boolean;
  depth: number;
  visited: Set<string>;
}) {
  const refKey = typeof schema.$ref === "string" ? schema.$ref : null;
  const itemRef =
    schema.type === "array" && typeof (schema.items as JSONSchema)?.$ref === "string"
      ? ((schema.items as JSONSchema).$ref as string)
      : null;
  const cycleKey = refKey ?? itemRef;
  const nested =
    depth < 3 && !(cycleKey && visited.has(cycleKey)) ? expandable(schema) : null;

  const description = schema.description as string | undefined;
  const examples = schema.examples as unknown[] | undefined;
  const def = schema.default;

  return (
    <>
      <div
        className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-2.5"
        style={{
          borderTop: "1px solid var(--line-1)",
          paddingLeft: 16 + depth * 18,
        }}
      >
        <code
          style={{
            fontFamily: mono,
            fontSize: 12.5,
            color: "var(--text-strong)",
            fontWeight: 500,
          }}
        >
          {name}
        </code>
        <span
          style={{
            fontFamily: mono,
            fontSize: 11.5,
            color: "var(--ds-accent)",
          }}
        >
          {typeLabel(schema)}
        </span>
        {required && (
          <span
            className="uppercase"
            style={{
              fontFamily: mono,
              fontSize: 9.5,
              letterSpacing: "0.06em",
              color: "var(--danger-400)",
            }}
          >
            required
          </span>
        )}
        <div className="w-full" />
        {description && (
          <span style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {description}
          </span>
        )}
        {def !== undefined && (
          <span style={{ fontSize: 12, color: "var(--text-faint)", fontFamily: mono }}>
            Default: {JSON.stringify(def)}
          </span>
        )}
        {examples?.length ? (
          <span style={{ fontSize: 12, color: "var(--text-faint)", fontFamily: mono }}>
            Example: {JSON.stringify(examples[0])}
          </span>
        ) : null}
      </div>
      {nested && (
        <PropertyRows
          schema={nested}
          depth={depth + 1}
          visited={cycleKey ? new Set([...visited, cycleKey]) : visited}
        />
      )}
    </>
  );
}

function PropertyRows({
  schema,
  depth,
  visited,
}: {
  schema: JSONSchema;
  depth: number;
  visited: Set<string>;
}) {
  const props = (schema.properties as Record<string, JSONSchema>) ?? {};
  const required = new Set((schema.required as string[] | undefined) ?? []);
  return (
    <>
      {Object.entries(props).map(([name, prop]) => (
        <PropertyRow
          key={name}
          name={name}
          schema={prop}
          required={required.has(name)}
          depth={depth}
          visited={visited}
        />
      ))}
    </>
  );
}

/**
 * Renders a JSON Schema (from the OpenAPI components) as a datasheet-style
 * property table, expanding nested objects and $refs up to a small depth.
 */
export function SchemaView({ schema }: { schema: JSONSchema }) {
  const resolved =
    typeof schema.$ref === "string" ? resolveSchemaRef(schema.$ref) : schema;

  // oneOf: a union of named variants (e.g. the claim response).
  if (Array.isArray(resolved.oneOf)) {
    return (
      <div className="flex flex-col gap-3">
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          One of the following objects:
        </p>
        {(resolved.oneOf as JSONSchema[]).map((variant, i) => (
          <div key={i}>
            <div
              className="mb-1 uppercase"
              style={{
                fontFamily: mono,
                fontSize: 11,
                letterSpacing: "0.06em",
                color: "var(--text-faint)",
              }}
            >
              {typeLabel(variant)}
            </div>
            <SchemaView schema={variant} />
          </div>
        ))}
      </div>
    );
  }

  const flat = flatten(resolved);
  const hasProps = flat.properties && Object.keys(flat.properties).length > 0;

  if (!hasProps) {
    // Scalar or string body (e.g. raw artifact content).
    return (
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--line-1)",
          fontFamily: mono,
          fontSize: 12.5,
          color: "var(--text-body)",
        }}
      >
        {typeLabel(resolved)}
        {typeof resolved.description === "string" && (
          <span style={{ color: "var(--text-muted)", fontFamily: "inherit" }}>
            {" — "}
            {resolved.description}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
    >
      {/* First row's top border is hidden by the container edge. */}
      <div style={{ marginTop: -1 }}>
        <PropertyRows schema={flat} depth={0} visited={new Set()} />
      </div>
    </div>
  );
}
