import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DocContainer, DocHeader, DocSection, Prose } from "@/components/docs/doc-content";
import { apiBaseUrl } from "@/lib/docs/api-catalog";

export const metadata: Metadata = {
  title: "Documentation — agtls",
  description: "REST and MCP documentation for agtls, open infrastructure for AI agents.",
};

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

function Card({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block no-underline transition-colors"
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--line-1)",
        padding: "20px 22px",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          style={{
            fontFamily: mono,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--text-strong)",
          }}
        >
          {title}
        </span>
        <ArrowRight size={16} style={{ color: "var(--ds-accent)" }} />
      </div>
      <p className="mt-2 mb-0" style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.5 }}>
        {children}
      </p>
    </Link>
  );
}

export default function DocsHomePage() {
  const base = apiBaseUrl();
  return (
    <DocContainer>
      <DocHeader
        eyebrow="Documentation"
        title="Build on agtls"
        lead="Open infrastructure for AI agents — tasks, webhooks, artifacts, and scheduled messages, exposed over a REST API and an MCP server. Authentication is optional: without a key, resources are created public and reachable by ID, then claimed later."
      />

      <DocSection title="Choose an interface">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card href="/docs/api" title="REST API">
            Standard HTTP + JSON. Every resource, with cursor pagination and a
            shared error envelope. Includes a machine-readable OpenAPI spec.
          </Card>
          <Card href="/docs/mcp" title="MCP Server">
            A Model Context Protocol endpoint your agent can connect to directly,
            exposing the same resources as tools.
          </Card>
        </div>
      </DocSection>

      <DocSection title="Base URL">
        <Prose>
          <p className="m-0">
            All REST endpoints live under{" "}
            <code
              style={{
                fontFamily: mono,
                fontSize: 13.5,
                color: "var(--text-strong)",
                background: "var(--surface-well)",
                padding: "1px 6px",
              }}
            >
              {base}
            </code>
            . Timestamps are Unix seconds. Lists are cursor-paginated with{" "}
            <code style={{ fontFamily: mono, fontSize: 13.5 }}>limit</code> and{" "}
            <code style={{ fontFamily: mono, fontSize: 13.5 }}>after</code>.
          </p>
        </Prose>
      </DocSection>

      <DocSection title="Authentication">
        <Prose>
          <p className="m-0">
            Pass an API key as{" "}
            <code style={{ fontFamily: mono, fontSize: 13.5 }}>
              Authorization: Bearer agt_live_…
            </code>{" "}
            to own resources under your organization. Omit it and resources are
            created public — the create response returns a one-time{" "}
            <code style={{ fontFamily: mono, fontSize: 13.5 }}>claim_token</code>{" "}
            you can later exchange for ownership.{" "}
            <Link href="/keys">Get an API key →</Link>
          </p>
        </Prose>
      </DocSection>
    </DocContainer>
  );
}
