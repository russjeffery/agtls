import { resolveSchemaRef, refName, type JSONSchema } from "./api-catalog";

// Pure JSON-Schema shaping helpers shared by the visual SchemaView component
// (src/components/docs/schema-view.tsx) and the plain-text reference emitted at
// /llms-full.txt. Keeping the shaping logic in one place means the two renderers
// can't drift from each other.

// ─── Schema normalization ──────────────────────────────────────────────────

// Merge an allOf chain (resolving member $refs) into a single object schema,
// preserving any sibling `properties` declared alongside the allOf. This is the
// shape the *CreateResponse schemas use (resource allOf + extra claim fields).
export function flatten(schema: JSONSchema): JSONSchema {
  if (!Array.isArray(schema.allOf)) return schema;
  const merged: JSONSchema = { type: "object", properties: {}, required: [] };
  const props = merged.properties as Record<string, JSONSchema>;
  const required = merged.required as string[];

  const absorb = (s: JSONSchema) => {
    const resolved = typeof s.$ref === "string" ? resolveSchemaRef(s.$ref) : s;
    const flat = flatten(resolved);
    Object.assign(props, (flat.properties as Record<string, JSONSchema>) ?? {});
    if (Array.isArray(flat.required)) required.push(...(flat.required as string[]));
  };

  for (const member of schema.allOf as JSONSchema[]) absorb(member);
  Object.assign(props, (schema.properties as Record<string, JSONSchema>) ?? {});
  if (Array.isArray(schema.required)) required.push(...(schema.required as string[]));
  return merged;
}

// A short, human-readable type label for a property schema.
export function typeLabel(schema: JSONSchema): string {
  if (typeof schema.$ref === "string") return refName(schema.$ref);

  if (schema.const !== undefined) return JSON.stringify(schema.const);

  if (Array.isArray(schema.enum)) {
    return (schema.enum as unknown[]).map((v) => JSON.stringify(v)).join(" | ");
  }

  if (Array.isArray(schema.oneOf)) {
    return (schema.oneOf as JSONSchema[]).map(typeLabel).join(" | ");
  }

  const t = schema.type;
  if (Array.isArray(t)) return (t as string[]).join(" | ");

  if (t === "array") {
    const items = schema.items as JSONSchema | undefined;
    return items ? `${typeLabel(items)}[]` : "array";
  }

  return typeof t === "string" ? t : "object";
}

// Does this property expand into a nested object table?
export function expandable(schema: JSONSchema): JSONSchema | null {
  const s = typeof schema.$ref === "string" ? resolveSchemaRef(schema.$ref) : schema;
  const flat = flatten(s);
  if (flat.properties && Object.keys(flat.properties).length) return flat;
  if (flat.type === "array") {
    const items = flat.items as JSONSchema | undefined;
    if (items) {
      const inner =
        typeof items.$ref === "string" ? resolveSchemaRef(items.$ref) : items;
      const flatInner = flatten(inner);
      if (flatInner.properties && Object.keys(flatInner.properties).length)
        return flatInner;
    }
  }
  return null;
}

// ─── Plain-text rendering ────────────────────────────────────────────────────

// The $ref / array-items-$ref a property cycles on, for the visited guard.
function cycleKey(schema: JSONSchema): string | null {
  if (typeof schema.$ref === "string") return schema.$ref;
  const items = schema.type === "array" ? (schema.items as JSONSchema | undefined) : undefined;
  return typeof items?.$ref === "string" ? items.$ref : null;
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function renderProperty(
  name: string,
  schema: JSONSchema,
  required: boolean,
  depth: number,
  visited: Set<string>,
  lines: string[]
): void {
  const key = cycleKey(schema);
  const nested = depth < 3 && !(key && visited.has(key)) ? expandable(schema) : null;

  const head = `${indent(depth)}- ${name} (${typeLabel(schema)})${required ? " · required" : ""}`;
  const meta: string[] = [];
  if (typeof schema.description === "string") meta.push(schema.description);
  if (schema.default !== undefined) meta.push(`Default: ${JSON.stringify(schema.default)}`);
  const examples = schema.examples as unknown[] | undefined;
  if (examples?.length) meta.push(`Example: ${JSON.stringify(examples[0])}`);
  lines.push(meta.length ? `${head} — ${meta.join("; ")}` : head);

  if (nested) {
    renderProperties(
      nested,
      depth + 1,
      key ? new Set([...visited, key]) : visited,
      lines
    );
  }
}

function renderProperties(
  schema: JSONSchema,
  depth: number,
  visited: Set<string>,
  lines: string[]
): void {
  const props = (schema.properties as Record<string, JSONSchema>) ?? {};
  const required = new Set((schema.required as string[] | undefined) ?? []);
  for (const [name, prop] of Object.entries(props)) {
    renderProperty(name, prop, required.has(name), depth, visited, lines);
  }
}

function renderSchema(
  schema: JSONSchema,
  depth: number,
  visited: Set<string>,
  lines: string[]
): void {
  const resolved =
    typeof schema.$ref === "string" ? resolveSchemaRef(schema.$ref) : schema;

  // oneOf: a union of named variants (e.g. the claim response).
  if (Array.isArray(resolved.oneOf)) {
    lines.push(`${indent(depth)}One of the following:`);
    for (const variant of resolved.oneOf as JSONSchema[]) {
      lines.push(`${indent(depth + 1)}• ${typeLabel(variant)}`);
      renderSchema(variant, depth + 1, visited, lines);
    }
    return;
  }

  const flat = flatten(resolved);
  const hasProps = flat.properties && Object.keys(flat.properties).length > 0;

  if (!hasProps) {
    // Scalar or string body (e.g. raw artifact content).
    const desc =
      typeof resolved.description === "string" ? ` — ${resolved.description}` : "";
    lines.push(`${indent(depth)}${typeLabel(resolved)}${desc}`);
    return;
  }

  renderProperties(flat, depth, visited, lines);
}

/**
 * Render a JSON Schema (from the OpenAPI components) as an indented plain-text
 * property tree — the text-mode counterpart of SchemaView, expanding nested
 * objects and $refs up to the same small depth.
 */
export function schemaToText(schema: JSONSchema, depth = 0): string {
  const lines: string[] = [];
  renderSchema(schema, depth, new Set(), lines);
  return lines.join("\n");
}
