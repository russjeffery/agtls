import { getOpenApiDocument } from "@/lib/openapi/document";

// Flattens the OpenAPI 3.1 document (src/lib/openapi/) into a doc-friendly shape:
// one entry per operation, grouped by tag, with $refs resolved against the
// document's components. The OpenAPI doc is the single source of truth for the
// REST surface, so these pages never drift from the API.

export type JSONSchema = Record<string, unknown>;

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface ParamDoc {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  schema?: JSONSchema;
}

export interface ResponseDoc {
  status: string;
  description: string;
  schema?: JSONSchema;
  contentType?: string;
}

export interface OperationDoc {
  slug: string;
  operationId: string;
  method: HttpMethod;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  /** True when the operation can be called without an API key. */
  public: boolean;
  parameters: ParamDoc[];
  requestSchema?: JSONSchema;
  responses: ResponseDoc[];
}

export interface TagGroup {
  name: string;
  description?: string;
  operations: OperationDoc[];
}

// camelCase operationId → kebab-case URL slug (listTasks → list-tasks).
export function slugForOperationId(operationId: string): string {
  return operationId.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

// Resolve a single "#/components/.../Name" reference against the document.
function resolveRef(doc: JSONSchema, ref: string): JSONSchema {
  const parts = ref.replace(/^#\//, "").split("/");
  let cur: unknown = doc;
  for (const part of parts) {
    cur = (cur as Record<string, unknown>)?.[part];
  }
  return (cur as JSONSchema) ?? {};
}

// Resolve only top-level $refs (params, responses). Property-level $refs inside
// schemas are left intact and resolved lazily by the schema renderer, so we keep
// recursive/self-referential schemas finite.
function deref(doc: JSONSchema, node: JSONSchema): JSONSchema {
  if (typeof node.$ref === "string") {
    return resolveRef(doc, node.$ref);
  }
  return node;
}

function isPublic(security: unknown): boolean {
  // security: [{}] (or [{}, {bearerAuth:[]}]) means an empty requirement is
  // allowed — i.e. the call works anonymously.
  if (!Array.isArray(security)) return false;
  return security.some(
    (req) => req && typeof req === "object" && Object.keys(req).length === 0
  );
}

function collectParameters(
  doc: JSONSchema,
  pathItem: JSONSchema,
  operation: JSONSchema
): ParamDoc[] {
  const raw = [
    ...((pathItem.parameters as JSONSchema[] | undefined) ?? []),
    ...((operation.parameters as JSONSchema[] | undefined) ?? []),
  ];
  return raw.map((p) => {
    const param = deref(doc, p);
    return {
      name: String(param.name ?? ""),
      in: String(param.in ?? ""),
      required: Boolean(param.required),
      description: param.description as string | undefined,
      schema: param.schema as JSONSchema | undefined,
    };
  });
}

function requestSchema(
  doc: JSONSchema,
  operation: JSONSchema
): JSONSchema | undefined {
  const body = operation.requestBody as JSONSchema | undefined;
  if (!body) return undefined;
  const content = body.content as Record<string, { schema?: JSONSchema }> | undefined;
  const json = content?.["application/json"];
  if (!json?.schema) return undefined;
  return deref(doc, json.schema);
}

function collectResponses(doc: JSONSchema, operation: JSONSchema): ResponseDoc[] {
  const responses = (operation.responses as Record<string, JSONSchema>) ?? {};
  return Object.entries(responses).map(([status, raw]) => {
    const resolved = deref(doc, raw);
    const content = resolved.content as
      | Record<string, { schema?: JSONSchema }>
      | undefined;
    let schema: JSONSchema | undefined;
    let contentType: string | undefined;
    if (content) {
      const [type, media] = Object.entries(content)[0] ?? [];
      contentType = type;
      schema = media?.schema ? deref(doc, media.schema) : undefined;
    }
    return {
      status,
      description: String(resolved.description ?? ""),
      schema,
      contentType,
    };
  });
}

let cached: { groups: TagGroup[]; operations: OperationDoc[] } | undefined;

function build(): { groups: TagGroup[]; operations: OperationDoc[] } {
  const doc = getOpenApiDocument() as JSONSchema;
  const paths = (doc.paths as Record<string, JSONSchema>) ?? {};
  const tagMeta = (doc.tags as { name: string; description?: string }[]) ?? [];

  const operations: OperationDoc[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as JSONSchema | undefined;
      if (!operation) continue;
      const operationId = operation.operationId as string | undefined;
      if (!operationId) continue;

      const tags = (operation.tags as string[] | undefined) ?? ["Other"];
      operations.push({
        slug: slugForOperationId(operationId),
        operationId,
        method,
        path,
        tag: tags[0],
        summary: String(operation.summary ?? operationId),
        description: operation.description as string | undefined,
        public: isPublic(operation.security ?? doc.security),
        parameters: collectParameters(doc, pathItem, operation),
        requestSchema: requestSchema(doc, operation),
        responses: collectResponses(doc, operation),
      });
    }
  }

  // Group by tag, ordered to match the document's tag list.
  const order = new Map(tagMeta.map((t, i) => [t.name, i]));
  const byTag = new Map<string, OperationDoc[]>();
  for (const op of operations) {
    const list = byTag.get(op.tag) ?? [];
    list.push(op);
    byTag.set(op.tag, list);
  }
  const groups: TagGroup[] = [...byTag.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
    .map(([name, ops]) => ({
      name,
      description: tagMeta.find((t) => t.name === name)?.description,
      operations: ops,
    }));

  return { groups, operations };
}

export function apiCatalog(): { groups: TagGroup[]; operations: OperationDoc[] } {
  cached ??= build();
  return cached;
}

export function getOperation(slug: string): OperationDoc | undefined {
  return apiCatalog().operations.find((op) => op.slug === slug);
}

// Resolve a property-level $ref for the schema renderer.
export function resolveSchemaRef(ref: string): JSONSchema {
  return resolveRef(getOpenApiDocument() as JSONSchema, ref);
}

// Pull a friendly schema/component name out of a $ref for display + linking.
export function refName(ref: string): string {
  return ref.split("/").pop() ?? ref;
}

// Base server URL the API is documented against.
export function apiBaseUrl(): string {
  const doc = getOpenApiDocument() as JSONSchema;
  const servers = doc.servers as { url: string }[] | undefined;
  return servers?.[0]?.url ?? "http://localhost:3000";
}
