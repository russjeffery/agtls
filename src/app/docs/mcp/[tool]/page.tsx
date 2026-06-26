import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocContainer, DocHeader, DocSection } from "@/components/docs/doc-content";
import { SchemaView } from "@/components/docs/schema-view";
import { CodeBlock } from "@/components/docs/code-block";
import { mcpTools, getTool, type JSONSchema } from "@/lib/docs/mcp-catalog";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export async function generateStaticParams() {
  return (await mcpTools()).map((t) => ({ tool: t.name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}): Promise<Metadata> {
  const { tool: name } = await params;
  const tool = await getTool(name);
  if (!tool) return { title: "Not found — agtls docs" };
  return { title: `${tool.name} — agtls MCP`, description: tool.description };
}

// Build a representative `arguments` object for the example call: required
// properties get a typed placeholder, plus api_key so the example is runnable.
function exampleArguments(schema: JSONSchema): Record<string, unknown> {
  const props = (schema.properties as Record<string, JSONSchema>) ?? {};
  const required = new Set((schema.required as string[] | undefined) ?? []);
  const out: Record<string, unknown> = {};
  if ("api_key" in props) out.api_key = "agt_…";
  for (const [name, prop] of Object.entries(props)) {
    if (name === "api_key" || !required.has(name)) continue;
    out[name] = placeholder(name, prop);
  }
  return out;
}

function placeholder(name: string, schema: JSONSchema): unknown {
  const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (Array.isArray(schema.enum)) return schema.enum[0];
  if (t === "number" || t === "integer") return 0;
  if (t === "boolean") return true;
  if (t === "array") return [];
  if (t === "object") return {};
  return `<${name}>`;
}

export default async function McpToolPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool: name } = await params;
  const tool = await getTool(name);
  if (!tool) notFound();

  const hasInputs =
    tool.inputSchema.properties &&
    Object.keys(tool.inputSchema.properties as object).length > 0;

  const example = JSON.stringify(
    { name: tool.name, arguments: exampleArguments(tool.inputSchema) },
    null,
    2
  );

  return (
    <DocContainer>
      <DocHeader
        eyebrow="MCP Tool"
        title={<code style={{ fontFamily: mono, fontSize: 30 }}>{tool.name}</code>}
        lead={tool.description}
      />

      <DocSection title="Input schema">
        {hasInputs ? (
          <SchemaView schema={tool.inputSchema} />
        ) : (
          <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
            This tool takes no arguments.
          </p>
        )}
      </DocSection>

      <DocSection title="Example call">
        <CodeBlock caption="tools/call params" code={example} />
      </DocSection>
    </DocContainer>
  );
}
