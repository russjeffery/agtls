import { apiCatalog, type OperationDoc, type ParamDoc } from "./api-catalog";
import { mcpToolGroups } from "./mcp-catalog";
import { schemaToText } from "./schema-shape";
import { authMarkdown } from "@/lib/agent-auth/discovery";

// Builders for the two llmstxt.org files served at the site root:
//   /llms.txt       — a concise, link-first index of the docs surface
//   /llms-full.txt  — the full reference: every REST operation and MCP tool,
//                     generated from the same catalogs that drive the docs UI,
//                     so it never drifts from the API.
//
// `base` is the canonical origin (e.g. https://agtls.dev), passed in by the
// route handlers so it tracks NEXT_PUBLIC_APP_URL the same way sitemap.ts does.

const SUMMARY =
  "Open infrastructure for AI agents — tasks, webhooks, artifacts, and " +
  "scheduled messages, exposed over a REST API and an MCP server. API key auth " +
  "is optional: without a key, resources are created public (reachable by ID) " +
  "and can be claimed later; with an `agt_…` key, resources are owned by " +
  "the key's organization.";

const ORIENTATION =
  "agtls exposes the same resources two ways — a standard HTTP + JSON REST API " +
  "and a Model Context Protocol (MCP) endpoint. All timestamps are Unix " +
  "seconds; lists use cursor pagination (`limit`, `after`). Errors use a shared " +
  "envelope. See docs/API_CONVENTIONS for the full rules.";

// First sentence of a description, for one-line link annotations.
function firstSentence(text: string | undefined): string {
  if (!text) return "";
  const trimmed = text.trim().replace(/\s+/g, " ");
  const end = trimmed.search(/\.(\s|$)/);
  return end === -1 ? trimmed : trimmed.slice(0, end + 1);
}

function methodPath(op: OperationDoc): string {
  return `${op.method.toUpperCase()} ${op.path}`;
}

/**
 * /llms.txt — the index. H1, a blockquote summary, an orientation paragraph,
 * then H2 sections whose bodies are link lists, per the llmstxt.org spec.
 */
export async function buildLlmsIndex(base: string): Promise<string> {
  const { groups } = apiCatalog();
  const toolGroups = await mcpToolGroups();

  const out: string[] = [];
  out.push("# agtls");
  out.push("");
  out.push(`> ${SUMMARY}`);
  out.push("");
  out.push(`${ORIENTATION} Base URL: \`${base}\`.`);
  out.push("");
  out.push(
    `For the complete reference of every endpoint and tool in one file, see ` +
      `[llms-full.txt](${base}/llms-full.txt).`
  );
  out.push("");

  out.push("## Docs");
  out.push(`- [Documentation home](${base}/docs): Overview and getting started.`);
  out.push(`- [REST API overview](${base}/docs/api): Base URL, auth, pagination, error envelope.`);
  out.push(`- [MCP server overview](${base}/docs/mcp): Connect an MCP client and call resources as tools.`);
  out.push(`- [OpenAPI specification](${base}/api/openapi.json): Machine-readable OpenAPI 3.1 (append \`?format=yaml\` for YAML).`);
  out.push("");

  out.push("## REST API");
  for (const group of groups) {
    for (const op of group.operations) {
      const note = firstSentence(op.description || op.summary);
      const auth = op.public ? " (no auth required)" : "";
      out.push(
        `- [${methodPath(op)} — ${op.summary}](${base}/docs/api/${op.slug})${auth}` +
          (note ? `: ${note}` : "")
      );
    }
  }
  out.push("");

  out.push("## MCP Tools");
  out.push(`Connect at \`${base}/api/mcp\`.`);
  for (const group of toolGroups) {
    for (const tool of group.tools) {
      const note = firstSentence(tool.description);
      out.push(
        `- [${tool.name}](${base}/docs/mcp/${tool.name})` + (note ? `: ${note}` : "")
      );
    }
  }
  out.push("");

  out.push("## Authentication");
  out.push(`- [Get an API key](${base}/keys): Create an \`agt_…\` key owned by an organization.`);
  out.push(`- [Agent auth & claiming](${base}/auth.md): How an agent self-issues a credential and binds it to a user.`);
  out.push("");

  out.push("## Optional");
  out.push(`- [Sitemap](${base}/sitemap.xml): All crawlable pages.`);
  out.push("");

  return out.join("\n");
}

// Render one REST operation as a plain-text block.
function operationBlock(op: OperationDoc, base: string): string {
  const out: string[] = [];
  out.push(`### ${methodPath(op)} — ${op.summary}`);
  out.push("");
  out.push(op.public ? "Auth: none required (public)." : "Auth: `Authorization: Bearer agt_…`");
  if (op.description) {
    out.push("");
    out.push(op.description.trim());
  }

  const pathParams = op.parameters.filter((p) => p.in === "path");
  const queryParams = op.parameters.filter((p) => p.in === "query");
  const paramLine = (p: ParamDoc) => {
    const type = Array.isArray(p.schema?.type)
      ? (p.schema?.type as string[]).join(" | ")
      : (p.schema?.type as string | undefined) ?? "string";
    const req = p.required ? " · required" : "";
    return `- ${p.name} (${type})${req}${p.description ? ` — ${p.description}` : ""}`;
  };

  if (pathParams.length) {
    out.push("");
    out.push("Path parameters:");
    out.push(...pathParams.map(paramLine));
  }
  if (queryParams.length) {
    out.push("");
    out.push("Query parameters:");
    out.push(...queryParams.map(paramLine));
  }

  if (op.requestSchema) {
    out.push("");
    out.push("Request body:");
    out.push(schemaToText(op.requestSchema));
  }

  out.push("");
  out.push("Responses:");
  for (const r of op.responses) {
    const ct = r.contentType && r.contentType !== "application/json" ? ` [${r.contentType}]` : "";
    out.push(`- ${r.status} ${r.description}${ct}`);
    if (r.schema) out.push(schemaToText(r.schema, 1));
  }

  // A minimal, copy-pasteable curl — mirrors the docs page.
  const authLine = op.public ? "" : ` \\\n  -H "Authorization: Bearer agt_…"`;
  const bodyLine = op.requestSchema
    ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '{ … }'`
    : "";
  const methodFlag = op.method === "get" ? "" : ` -X ${op.method.toUpperCase()}`;
  out.push("");
  out.push("Example:");
  out.push("```");
  out.push(`curl${methodFlag} ${base}${op.path}${authLine}${bodyLine}`);
  out.push("```");

  return out.join("\n");
}

/**
 * /llms-full.txt — the full generated reference. H1 + summary, the agent-auth
 * narrative (authMarkdown, the canonical agent-facing prose), then every REST
 * operation grouped by tag and every MCP tool grouped by category, each with
 * its full schema.
 */
export async function buildLlmsFull(base: string): Promise<string> {
  const { groups } = apiCatalog();
  const toolGroups = await mcpToolGroups();

  const out: string[] = [];
  out.push("# agtls — Full reference");
  out.push("");
  out.push(`> ${SUMMARY}`);
  out.push("");
  out.push(
    `${ORIENTATION} Base URL: \`${base}\`. The machine-readable OpenAPI 3.1 ` +
      `spec is at ${base}/api/openapi.json. The index lives at ${base}/llms.txt.`
  );
  out.push("");

  // Agent auth narrative — the canonical agent-facing discovery doc (auth.md),
  // demoted one heading level so its H1 becomes this file's "## Agent
  // Registration" section and its steps nest beneath.
  out.push(demoteHeadings(authMarkdown()));
  out.push("");

  out.push("## REST API");
  out.push("");
  for (const group of groups) {
    out.push(`### ${group.name}`);
    if (group.description) {
      out.push("");
      out.push(group.description.trim());
    }
    out.push("");
    for (const op of group.operations) {
      // Operations render at one heading level deeper than their tag group.
      out.push(operationBlock(op, base).replace(/^### /, "#### "));
      out.push("");
    }
  }

  out.push("## MCP Server");
  out.push("");
  out.push(`Connect any MCP client to \`${base}/api/mcp\` with an \`agt_…\` bearer token. Tools mirror the REST resources.`);
  out.push("");
  for (const group of toolGroups) {
    out.push(`### ${group.label}`);
    out.push("");
    for (const tool of group.tools) {
      out.push(`#### ${tool.name}`);
      if (tool.description) {
        out.push("");
        out.push(tool.description.trim());
      }
      out.push("");
      out.push("Input:");
      out.push(schemaToText(tool.inputSchema));
      out.push("");
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// Push every ATX heading in a markdown block down one level (# → ##), so an
// embedded document nests cleanly under its host section. Capped at h6.
function demoteHeadings(markdown: string): string {
  return markdown.replace(/^(#{1,5}) /gm, "$1# ");
}
