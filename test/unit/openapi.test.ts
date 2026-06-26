/**
 * Unit tests for the OpenAPI spec:
 *   src/lib/openapi/*           — buildOpenApiDocument and components/paths
 *   src/app/api/openapi.json    — the serving route (JSON + ?format=yaml)
 *
 * Pure (no DB) — the document is assembled from static components and Zod schemas.
 */
import { describe, it, expect } from "vitest";
import { parse } from "yaml";
import pkg from "../../package.json";
import { buildOpenApiDocument } from "@/lib/openapi/document";
import { makeRequest, json } from "../helpers/request";

const doc = buildOpenApiDocument();

// Every path+method the spec is expected to document.
const EXPECTED: Record<string, string[]> = {
  "/api/tasks": ["get", "post"],
  "/api/tasks/{id}": ["get", "patch", "delete"],
  "/api/webhooks": ["get", "post"],
  "/api/webhooks/{id}": ["get", "patch", "delete"],
  "/api/webhooks/{id}/events": ["get", "delete"],
  "/api/webhooks/{id}/events/{eventId}": ["get", "delete"],
  "/api/artifacts": ["get", "post"],
  "/api/artifacts/{id}": ["get", "patch", "delete"],
  "/api/artifacts/{id}/raw": ["get"],
  "/api/messages": ["get", "post"],
  "/api/messages/{id}": ["get", "patch", "delete"],
  "/api/messages/dispatch": ["post"],
  "/api/claim/{id}": ["post"],
  "/api/catch/{id}": ["get", "post", "put", "patch", "delete"],
};

// Recursively collect every $ref string in the document.
function collectRefs(node: unknown, acc: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, acc);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") acc.push(value);
      else collectRefs(value, acc);
    }
  }
  return acc;
}

// Resolve a local JSON-pointer ref like "#/components/schemas/Task".
function resolveRef(ref: string): unknown {
  const parts = ref.replace(/^#\//, "").split("/");
  let cur: unknown = doc;
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

describe("buildOpenApiDocument", () => {
  it("is an OpenAPI 3.1 document", () => {
    expect(doc.openapi).toBe("3.1.0");
    const info = doc.info as { title: string; version: string };
    expect(info.title).toBe("Agent Tools API");
    expect(info.version).toBe(pkg.version);
  });

  it("declares optional bearer auth", () => {
    expect(doc.security).toEqual([{}, { bearerAuth: [] }]);
    const components = doc.components as { securitySchemes: Record<string, unknown> };
    expect(components.securitySchemes.bearerAuth).toBeDefined();
  });

  it("documents every expected path and method", () => {
    const paths = doc.paths as Record<string, Record<string, unknown>>;
    for (const [path, methods] of Object.entries(EXPECTED)) {
      expect(paths[path], `missing path ${path}`).toBeDefined();
      for (const method of methods) {
        expect(paths[path][method], `missing ${method.toUpperCase()} ${path}`).toBeDefined();
      }
    }
    // No unexpected top-level paths.
    expect(Object.keys(paths).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("gives every operation a unique operationId", () => {
    const paths = doc.paths as Record<string, Record<string, { operationId?: string }>>;
    const ids: string[] = [];
    for (const [path, methods] of Object.entries(EXPECTED)) {
      for (const method of methods) {
        const id = paths[path][method].operationId;
        expect(id, `missing operationId for ${method} ${path}`).toBeTruthy();
        ids.push(id!);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no dangling $refs", () => {
    const refs = collectRefs(doc);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(resolveRef(ref), `unresolved $ref ${ref}`).toBeDefined();
    }
  });

  it("converts Zod request schemas without leaking the $schema marker", () => {
    const paths = doc.paths as Record<string, Record<string, unknown>>;
    const post = paths["/api/tasks"].post as {
      requestBody: { content: Record<string, { schema: Record<string, unknown> }> };
    };
    const schema = post.requestBody.content["application/json"].schema;
    expect(schema.$schema).toBeUndefined();
    expect((schema.properties as Record<string, unknown>).name).toBeDefined();
    expect(schema.required).toEqual(["name"]);
  });

  it("requires auth on claim but leaves it optional elsewhere", () => {
    const paths = doc.paths as Record<string, Record<string, { security: unknown }>>;
    expect(paths["/api/claim/{id}"].post.security).toEqual([{ bearerAuth: [] }]);
    expect(paths["/api/tasks"].get.security).toEqual([{}, { bearerAuth: [] }]);
  });

  it("documents the Task response shape with unix timestamps", () => {
    const components = doc.components as {
      schemas: Record<string, { properties: Record<string, { type: unknown }> }>;
    };
    const task = components.schemas.Task;
    expect(task.properties.object).toMatchObject({ const: "task" });
    expect(task.properties.created_at.type).toEqual(["integer", "null"]);
  });
});

describe("GET /api/openapi.json", () => {
  it("returns the spec as JSON by default", async () => {
    const { GET } = await import("@/app/api/openapi.json/route");
    const res = await GET(makeRequest("/api/openapi.json"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await json<{ openapi: string; paths: Record<string, unknown> }>(res);
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths["/api/tasks"]).toBeDefined();
  });

  it("returns YAML that round-trips to the same document when ?format=yaml", async () => {
    const { GET } = await import("@/app/api/openapi.json/route");
    const res = await GET(makeRequest("/api/openapi.json?format=yaml"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/yaml");
    const text = await res.text();
    const parsed = parse(text) as { openapi: string };
    expect(parsed.openapi).toBe("3.1.0");
    expect(parsed).toEqual(doc);
  });
});
