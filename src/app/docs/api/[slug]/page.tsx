import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocContainer, DocHeader, DocSection } from "@/components/docs/doc-content";
import { MethodBadge } from "@/components/docs/method-badge";
import { SchemaView } from "@/components/docs/schema-view";
import { CodeBlock } from "@/components/docs/code-block";
import {
  apiCatalog,
  getOperation,
  apiBaseUrl,
  type ParamDoc,
} from "@/lib/docs/api-catalog";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export function generateStaticParams() {
  return apiCatalog().operations.map((op) => ({ slug: op.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const op = getOperation(slug);
  if (!op) return { title: "Not found — agtls docs" };
  return {
    title: `${op.summary} — agtls API`,
    description: op.description ?? op.summary,
  };
}

function statusColor(status: string): string {
  if (status.startsWith("2")) return "var(--green-600)";
  if (status.startsWith("4")) return "var(--danger-400)";
  if (status.startsWith("5")) return "var(--danger-500)";
  return "var(--text-muted)";
}

function paramType(p: ParamDoc): string {
  const t = p.schema?.type;
  if (Array.isArray(t)) return t.join(" | ");
  return typeof t === "string" ? t : "string";
}

function ParamTable({ title, params }: { title: string; params: ParamDoc[] }) {
  if (!params.length) return null;
  return (
    <div className="mb-4">
      <div
        className="mb-2 uppercase"
        style={{
          fontFamily: mono,
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "var(--text-faint)",
        }}
      >
        {title}
      </div>
      <div
        className="overflow-hidden rounded-xl"
        style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
      >
        {params.map((p, i) => (
          <div
            key={p.name}
            className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-2.5"
            style={{ borderTop: i === 0 ? undefined : "1px solid var(--line-1)" }}
          >
            <code style={{ fontFamily: mono, fontSize: 12.5, color: "var(--text-strong)", fontWeight: 500 }}>
              {p.name}
            </code>
            <span style={{ fontFamily: mono, fontSize: 11.5, color: "var(--ds-accent)" }}>
              {paramType(p)}
            </span>
            {p.required && (
              <span
                className="uppercase"
                style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.06em", color: "var(--danger-400)" }}
              >
                required
              </span>
            )}
            {p.description && (
              <>
                <div className="w-full" />
                <span style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {p.description}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ApiEndpointPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const op = getOperation(slug);
  if (!op) notFound();

  const base = apiBaseUrl();
  const pathParams = op.parameters.filter((p) => p.in === "path");
  const queryParams = op.parameters.filter((p) => p.in === "query");

  // A minimal, copy-pasteable curl. Path params are left as :placeholders.
  const authLine = op.public ? "" : ` \\\n  -H "Authorization: Bearer agt_…"`;
  const bodyLine = op.requestSchema ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '{ … }'` : "";
  const methodFlag = op.method === "get" ? "" : ` -X ${op.method.toUpperCase()}`;
  const curl = `curl${methodFlag} ${base}${op.path}${authLine}${bodyLine}`;

  return (
    <DocContainer>
      <DocHeader
        eyebrow={op.tag}
        title={op.summary}
        aside={op.public ? (
          <span
            className="uppercase"
            style={{
              fontFamily: mono,
              fontSize: 10,
              letterSpacing: "0.08em",
              color: "var(--text-faint)",
              border: "1px solid var(--line-2)",
              padding: "3px 7px",
            }}
          >
            No auth required
          </span>
        ) : undefined}
        lead={op.description}
      />

      {/* Method + path bar */}
      <div
        className="mb-8 flex items-center gap-3 overflow-x-auto rounded-xl px-4 py-3"
        style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
      >
        <MethodBadge method={op.method} />
        <code style={{ fontFamily: mono, fontSize: 14, color: "var(--text-strong)" }}>
          {op.path}
        </code>
      </div>

      {(pathParams.length > 0 || queryParams.length > 0) && (
        <DocSection title="Parameters">
          <ParamTable title="Path" params={pathParams} />
          <ParamTable title="Query" params={queryParams} />
        </DocSection>
      )}

      {op.requestSchema && (
        <DocSection title="Request body">
          <SchemaView schema={op.requestSchema} />
        </DocSection>
      )}

      <DocSection title="Responses">
        <div className="flex flex-col gap-5">
          {op.responses.map((r) => (
            <div key={r.status}>
              <div className="mb-2 flex items-center gap-2.5">
                <span
                  style={{
                    fontFamily: mono,
                    fontSize: 13,
                    fontWeight: 600,
                    color: statusColor(r.status),
                    border: `1px solid color-mix(in oklab, ${statusColor(r.status)} 45%, transparent)`,
                    padding: "2px 8px",
                  }}
                >
                  {r.status}
                </span>
                <span style={{ fontSize: 14, color: "var(--text-body)" }}>
                  {r.description}
                </span>
                {r.contentType && r.contentType !== "application/json" && (
                  <code style={{ fontFamily: mono, fontSize: 11.5, color: "var(--text-faint)" }}>
                    {r.contentType}
                  </code>
                )}
              </div>
              {r.schema && <SchemaView schema={r.schema} />}
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection title="Example request">
        <CodeBlock lang="text" caption="curl" code={curl} />
      </DocSection>
    </DocContainer>
  );
}
