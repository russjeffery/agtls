import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/lib/mcp/server";
import { apiBaseUrl } from "./api-catalog";

// Introspects the real MCP server (src/lib/mcp/server.ts) over an in-process
// transport pair and lists its tools. The tools are registered imperatively, so
// rather than maintain a parallel catalog by hand we ask the server itself —
// these pages then stay in lockstep with what agents actually see.

export type JSONSchema = Record<string, unknown>;

export interface ToolDoc {
  name: string;
  /** Group key derived from the tool name (e.g. "tasks", "webhook_endpoints"). */
  category: string;
  description: string;
  inputSchema: JSONSchema;
}

export interface ToolGroup {
  name: string;
  label: string;
  tools: ToolDoc[];
}

// Human label for a category key. Falls back to title-casing the key.
const CATEGORY_LABELS: Record<string, string> = {
  agent: "Agent auth",
  tasks: "Tasks",
  webhooks: "Webhooks",
  artifact: "Artifacts",
  messages: "Messages",
  claim: "Claim",
};

// Order categories the same way the REST docs are ordered.
const CATEGORY_ORDER = [
  "agent",
  "tasks",
  "webhooks",
  "artifact",
  "messages",
  "claim",
];

function categoryFor(toolName: string): string {
  // A tool belongs to the category whose key it matches or is prefixed by
  // (e.g. tasks_read -> tasks, webhooks_write -> webhooks, agent_auth -> agent).
  for (const key of CATEGORY_ORDER) {
    if (toolName === key || toolName.startsWith(`${key}_`)) return key;
  }
  // Fall back to the first underscore-delimited segment.
  return toolName.split("_")[0] ?? toolName;
}

function titleCase(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

let cached: ToolDoc[] | undefined;

async function listTools(): Promise<ToolDoc[]> {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "agtls-docs", version: "0.1.0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      category: categoryFor(t.name),
      description: t.description ?? "",
      inputSchema: (t.inputSchema as JSONSchema) ?? {},
    }));
  } finally {
    await client.close();
    await server.close();
  }
}

export async function mcpTools(): Promise<ToolDoc[]> {
  cached ??= await listTools();
  return cached;
}

export async function mcpToolGroups(): Promise<ToolGroup[]> {
  const tools = await mcpTools();
  const byCat = new Map<string, ToolDoc[]>();
  for (const tool of tools) {
    const list = byCat.get(tool.category) ?? [];
    list.push(tool);
    byCat.set(tool.category, list);
  }
  return [...byCat.entries()]
    .sort(
      (a, b) =>
        (CATEGORY_ORDER.indexOf(a[0]) + 1 || 99) -
        (CATEGORY_ORDER.indexOf(b[0]) + 1 || 99)
    )
    .map(([name, list]) => ({
      name,
      label: CATEGORY_LABELS[name] ?? titleCase(name),
      tools: list,
    }));
}

export async function getTool(name: string): Promise<ToolDoc | undefined> {
  return (await mcpTools()).find((t) => t.name === name);
}

// The URL agents point their MCP client at.
export function mcpUrl(): string {
  return `${apiBaseUrl()}/api/mcp`;
}
