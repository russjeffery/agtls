import type { Metadata } from "next";
import Link from "next/link";
import { DocContainer, DocHeader, DocSection, Prose } from "@/components/docs/doc-content";
import { MethodBadge } from "@/components/docs/method-badge";
import { CodeBlock } from "@/components/docs/code-block";
import { apiCatalog, apiBaseUrl } from "@/lib/docs/api-catalog";

export const metadata: Metadata = {
  title: "REST API — agtls docs",
  description: "Reference for the agtls REST API: tasks, webhooks, artifacts, messages, and claim.",
};

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export default function ApiOverviewPage() {
  const { groups } = apiCatalog();
  const base = apiBaseUrl();

  return (
    <DocContainer>
      <DocHeader
        eyebrow="REST API"
        title="REST API reference"
        lead="HTTP + JSON over a single base URL. API key auth is optional — without a key, resources are created public and reachable by ID; with an agt_… key they're owned by the key's organization."
      />

      <DocSection title="Authentication">
        <Prose>
          <p className="mt-0">
            Send your key in the <code>Authorization</code> header. Anonymous
            requests still succeed for most endpoints, creating public resources.
          </p>
        </Prose>
        <CodeBlock
          lang="text"
          caption="Authorization header"
          code={`Authorization: Bearer agt_xxxxxxxxxxxxxxxxxxxxxxxx`}
        />
      </DocSection>

      <DocSection title="Pagination">
        <Prose>
          <p className="mt-0 mb-0">
            List endpoints accept <code>limit</code> (1–100, default 20) and{" "}
            <code>after</code> (the ID of the last item from the previous page).
            Responses carry <code>has_more</code> and <code>next_cursor</code>;
            pass <code>next_cursor</code> back as <code>after</code> for the next
            page.
          </p>
        </Prose>
      </DocSection>

      <DocSection title="Errors">
        <Prose>
          <p className="mt-0">
            All 4xx/5xx responses share one envelope. <code>type</code> is a
            broad class, <code>code</code> is machine-readable, and{" "}
            <code>param</code> names the offending field when relevant.
          </p>
        </Prose>
        <CodeBlock
          caption="Error envelope"
          code={JSON.stringify(
            {
              error: {
                type: "invalid_request_error",
                code: "validation_failed",
                message: "name is required.",
                param: "name",
              },
            },
            null,
            2
          )}
        />
      </DocSection>

      <DocSection title="OpenAPI">
        <Prose>
          <p className="mt-0 mb-0">
            The full machine-readable spec is available as{" "}
            <a href="/api/openapi.json">JSON</a> or{" "}
            <a href="/api/openapi.json?format=yaml">YAML</a> — drop it into
            Postman, an SDK generator, or your agent.
          </p>
        </Prose>
      </DocSection>

      {groups.map((group) => (
        <DocSection key={group.name} title={group.name}>
          {group.description && (
            <p
              className="mt-0 mb-3"
              style={{ fontSize: 14, color: "var(--text-muted)" }}
            >
              {group.description}
            </p>
          )}
          <div
            className="overflow-hidden rounded-xl"
            style={{ background: "var(--surface-card)", border: "1px solid var(--line-1)" }}
          >
            {group.operations.map((op, i) => (
              <Link
                key={op.slug}
                href={`/docs/api/${op.slug}`}
                className="flex items-center gap-3 px-4 py-3 no-underline transition-colors hover:bg-[var(--surface-raised)]"
                style={{ borderTop: i === 0 ? undefined : "1px solid var(--line-1)" }}
              >
                <MethodBadge method={op.method} size="sm" />
                <span style={{ fontSize: 14, color: "var(--text-strong)" }}>
                  {op.summary}
                </span>
                <code
                  className="ml-auto truncate"
                  style={{
                    fontFamily: mono,
                    fontSize: 12,
                    color: "var(--text-faint)",
                  }}
                >
                  {op.path}
                </code>
              </Link>
            ))}
          </div>
        </DocSection>
      ))}

      <p style={{ fontSize: 13, color: "var(--text-faint)" }}>
        Base URL: <code style={{ fontFamily: mono }}>{base}</code>
      </p>
    </DocContainer>
  );
}
