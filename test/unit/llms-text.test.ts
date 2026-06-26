/**
 * Unit tests for the llmstxt.org builders:
 *   src/lib/docs/llms-text.ts   — buildLlmsIndex (/llms.txt) and buildLlmsFull (/llms-full.txt)
 *
 * Both are generated from the API + MCP catalogs (the same source the docs UI
 * uses), so these tests pin the structure and guard against drift.
 */
import { describe, it, expect } from "vitest";
import { buildLlmsIndex, buildLlmsFull } from "@/lib/docs/llms-text";
import { apiCatalog } from "@/lib/docs/api-catalog";
import { mcpTools } from "@/lib/docs/mcp-catalog";

const BASE = "https://agtls.dev";

describe("/llms.txt index", () => {
  it("opens with an H1 and a blockquote summary", async () => {
    const txt = await buildLlmsIndex(BASE);
    expect(txt.startsWith("# agtls\n")).toBe(true);
    expect(txt).toMatch(/\n> Open infrastructure for AI agents/);
  });

  it("links every REST operation to its docs page", async () => {
    const txt = await buildLlmsIndex(BASE);
    for (const op of apiCatalog().operations) {
      expect(txt).toContain(`(${BASE}/docs/api/${op.slug})`);
    }
  });

  it("links every MCP tool to its docs page", async () => {
    const txt = await buildLlmsIndex(BASE);
    for (const tool of await mcpTools()) {
      expect(txt).toContain(`(${BASE}/docs/mcp/${tool.name})`);
    }
  });

  it("has the expected section headings and points at llms-full.txt", async () => {
    const txt = await buildLlmsIndex(BASE);
    for (const h of ["## Docs", "## REST API", "## MCP Tools", "## Authentication"]) {
      expect(txt).toContain(h);
    }
    expect(txt).toContain(`(${BASE}/llms-full.txt)`);
  });

  it("uses the provided base URL throughout (no localhost leakage)", async () => {
    const txt = await buildLlmsIndex(BASE);
    expect(txt).not.toContain("localhost");
  });
});

describe("/llms-full.txt reference", () => {
  it("includes the agent-auth narrative and a section per surface", async () => {
    const txt = await buildLlmsFull(BASE);
    expect(txt.startsWith("# agtls — Full reference\n")).toBe(true);
    expect(txt).toContain("Agent Registration"); // demoted authMarkdown H1
    expect(txt).toContain("## REST API");
    expect(txt).toContain("## MCP Server");
  });

  it("documents every REST operation with method + path and a curl example", async () => {
    const txt = await buildLlmsFull(BASE);
    for (const op of apiCatalog().operations) {
      expect(txt).toContain(`${op.method.toUpperCase()} ${op.path}`);
    }
    expect(txt).toContain(`curl ${BASE}/api/tasks`);
  });

  it("documents every MCP tool with an Input schema", async () => {
    const txt = await buildLlmsFull(BASE);
    for (const tool of await mcpTools()) {
      expect(txt).toContain(`#### ${tool.name}`);
    }
    expect(txt).toContain("Input:");
  });

  it("never emits three or more consecutive newlines", async () => {
    const txt = await buildLlmsFull(BASE);
    expect(txt).not.toMatch(/\n{3,}/);
  });
});
