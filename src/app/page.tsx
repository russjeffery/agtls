import Link from "next/link";
import { getPageViewer } from "@/lib/api/page-viewer";
import { AppHeader } from "@/components/app-header";
import { SiteFooter } from "@/components/site-footer";
import { CodeTabs, type CodeTab } from "@/components/home/code-tabs";
import { highlight } from "@/lib/shiki";

const mono = "var(--font-spline-mono, ui-monospace, monospace)";
const body = "var(--font-hanken, system-ui, sans-serif)";
const display = "var(--font-archivo, system-ui, sans-serif)";

const TOOLS = [
  {
    name: "Tasks",
    path: "POST /api/tasks",
    href: "/tasks",
    desc: "Create and track work with priorities, due dates, and labels.",
  },
  {
    name: "Artifacts",
    path: "POST /api/artifacts",
    href: "/artifacts",
    desc: "Markdown an agent writes now and recalls in a later session.",
  },
  {
    name: "Messages",
    path: "POST /api/messages",
    href: "/messages",
    desc: "Schedule an HTTP request for the future — wake an agent on time.",
  },
  {
    name: "Webhooks",
    path: "POST /api/webhooks",
    href: "/webhooks",
    desc: "A URL that catches anything sent to it. Store and inspect every event.",
  },
];

const PRINCIPLES = [
  {
    tag: "// no key",
    title: "No key required",
    body: (
      <>
        Resources are public by default. Your agent creates a task with one
        unauthenticated call; a one-time claim token lets you take ownership
        later.
      </>
    ),
  },
  {
    tag: "// rest + mcp",
    title: "REST and MCP, one endpoint",
    body: (
      <>
        Every tool is a typed JSON API and an MCP tool from the same endpoint.
        OpenAPI 3.1 spec at{" "}
        <a
          href="/api/openapi.json"
          style={{ color: "var(--accent-hover)" }}
          className="underline underline-offset-[3px]"
        >
          /api/openapi.json
        </a>
        .
      </>
    ),
  },
  {
    tag: "// json ↔ html",
    title: "JSON for agents, HTML for you",
    body: (
      <>
        Every endpoint content-negotiates. Your agent gets JSON; you open the
        same URL in a browser and read the data.
      </>
    ),
  },
  {
    tag: "// membership",
    title: "Agents are members",
    body: (
      <>
        Humans and agents sit in the same organization. Sign in and see every
        agent with access to your resources — and revoke them.
      </>
    ),
  },
];

const labelStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const displayStyle: React.CSSProperties = {
  fontFamily: display,
  fontWeight: 840,
  fontVariationSettings: '"wdth" 118',
  textTransform: "uppercase",
  lineHeight: 0.9,
  letterSpacing: "-0.018em",
  color: "var(--text-strong)",
  margin: 0,
};

function Dot({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 rounded-full ${className}`}
      style={{ background: "var(--ds-accent)" }}
    />
  );
}

function MetaStrip() {
  const item =
    "flex items-center gap-2 px-[18px] py-[9px] border-r border-[var(--line-1)]";
  const itemStyle: React.CSSProperties = {
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  };
  return (
    <div
      className="flex flex-wrap border-b-2 border-[var(--text-strong)]"
      style={{ background: "var(--bg-deep)" }}
    >
      <span className={item} style={itemStyle}>
        <b style={{ color: "var(--text-strong)", fontWeight: 600 }}>
          Agent Tools
        </b>
      </span>
      <span className={item} style={itemStyle}>
        Rev{" "}
        <b style={{ color: "var(--text-strong)", fontWeight: 600 }}>0.1</b>
      </span>
      <span className={item} style={itemStyle}>
        Status <Dot className="animate-pulse" />{" "}
        <b style={{ color: "var(--text-strong)", fontWeight: 600 }}>Live</b>
      </span>
      <span
        className="flex flex-1 items-center px-[18px] py-[9px]"
        style={itemStyle}
      />
      <span
        className="flex items-center px-[18px] py-[9px] border-l border-[var(--line-1)]"
        style={itemStyle}
      >
        MCP Ready
      </span>
    </div>
  );
}

const CURL_SNIPPET = `curl -X POST https://agtls.dev/api/tasks \\
  -d '{"name":"Review PR #142","priority":"high"}'`;

const MCP_SNIPPET = `{
  "mcpServers": {
    "agtls": {
      "url": "https://agtls.dev/api/mcp"
    }
  }
}`;

const AGENT_PROMPT = `You have shell access. Use agtls (https://agtls.dev) —
open infrastructure for agents, no API key required — to
track this work.

Create a task with a plain HTTP call:

  curl -X POST https://agtls.dev/api/tasks \\
    -d '{"name":"<short title>","priority":"high"}'

The JSON response includes an "id" and a "claim_url". Save
the id so you can update the task later, and give me the
claim_url so I can take ownership in my org.`;

async function Hero() {
  const tabs: CodeTab[] = [
    {
      id: "curl",
      label: "cURL",
      html: await highlight(CURL_SNIPPET, "bash"),
      code: CURL_SNIPPET,
      note: "One unauthenticated POST. No key, no signup — claim it into your org later.",
    },
    {
      id: "mcp",
      label: "MCP",
      html: await highlight(MCP_SNIPPET, "json"),
      code: MCP_SNIPPET,
      note: "Add to your MCP client config (Claude Desktop, Cursor, …). Server URL: https://agtls.dev/api/mcp",
    },
    {
      id: "agent",
      label: "Agent prompt",
      html: null,
      code: AGENT_PROMPT,
      note: "Paste into an agent that can run shell commands (Claude Code, a sandbox, etc.).",
    },
  ];

  return (
    <section className="border-b-2 border-[var(--text-strong)] px-5 pt-12 sm:px-10 sm:pt-16">
      <span
        className="mb-7 inline-flex items-center gap-2.5"
        style={{ ...labelStyle, color: "var(--accent-hover)" }}
      >
        REST · MCP · No key required
      </span>

      <h1
        style={{
          ...displayStyle,
          fontSize: "clamp(3.25rem, 9vw, 10.5rem)",
        }}
      >
        Simple tools
        <br />
        for <em style={{ fontStyle: "normal", color: "var(--ds-accent)" }}>
          agents
        </em>
      </h1>

      <div className="mt-14 grid grid-cols-1 md:grid-cols-2">
        <div className="py-9 pr-0 md:pr-12 pb-14">
          <p
            className="mb-9 max-w-[46ch]"
            style={{
              fontFamily: body,
              fontSize: 19,
              lineHeight: 1.5,
              color: "var(--text-muted)",
            }}
          >
            Tasks, artifacts, scheduled wake-ups, and webhook catchers your
            agent reaches over plain HTTP or MCP. No auth, unless you want to
            save them.
          </p>
          <div className="flex flex-wrap gap-3.5">
            <a
              href="#curl"
              className="inline-flex items-center gap-2.5 border-2 px-[22px] py-[15px] transition-colors"
              style={{
                fontFamily: mono,
                fontSize: 13,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderColor: "var(--text-strong)",
                background: "var(--ds-accent)",
                color: "var(--text-on-accent)",
              }}
            >
              Start with one curl →
            </a>
            <a
              href="/docs"
              className="inline-flex items-center gap-2.5 border-2 px-[22px] py-[15px] transition-colors hover:bg-[var(--text-strong)] hover:text-[var(--bg-app)]"
              style={{
                fontFamily: mono,
                fontSize: 13,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderColor: "var(--text-strong)",
                color: "var(--text-strong)",
              }}
            >
              Read the API docs
            </a>
          </div>
        </div>

        <div
          id="curl"
          className="flex items-stretch border-t-2 md:border-t-0 md:border-l-2 border-[var(--text-strong)]"
        >
          <CodeTabs tabs={tabs} />
        </div>
      </div>
    </section>
  );
}

function SectionHead({ label, title }: { label: string; title: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-[18px] border-b-2 border-[var(--text-strong)] px-5 py-[26px] sm:px-10">
      <span style={{ ...labelStyle, color: "var(--accent-hover)" }}>{label}</span>
      <h2
        style={{
          ...displayStyle,
          fontSize: "clamp(1.9rem, 4.6vw, 4rem)",
        }}
      >
        {title}
      </h2>
    </div>
  );
}

function Tools() {
  return (
    <section id="tools">
      <SectionHead label="// available now" title="Four tools. Zero setup." />
      <div className="grid grid-cols-1 overflow-hidden border-b-2 border-[var(--text-strong)] sm:grid-cols-2 lg:grid-cols-4">
        {TOOLS.map((t) => (
          <Link
            key={t.name}
            href={t.href}
            className="group flex min-h-[280px] flex-col gap-4 border-b border-r border-[var(--line-1)] px-[22px] pt-[22px] pb-[26px] transition-colors hover:bg-[var(--text-strong)]"
            style={{ color: "var(--text-strong)", textDecoration: "none" }}
          >
            <div className="flex items-center justify-between">
              <span
                className="inline-flex items-center gap-[7px] group-hover:text-[#c9c7bb]"
                style={{
                  fontFamily: mono,
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                }}
              >
                <Dot /> Live
              </span>
              <span
                className="translate-x-[-4px] opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 group-hover:text-[var(--bg-app)]"
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Open →
              </span>
            </div>
            <span
              className="mt-auto group-hover:text-[var(--bg-app)]"
              style={{
                ...displayStyle,
                fontWeight: 820,
                fontVariationSettings: '"wdth" 102',
                fontSize: "2rem",
              }}
            >
              {t.name}
            </span>
            <span
              className="group-hover:text-[#8f8bff]"
              style={{
                fontFamily: mono,
                fontSize: 12,
                color: "var(--accent-hover)",
              }}
            >
              {t.path}
            </span>
            <span
              className="group-hover:text-[#c9c7bb]"
              style={{
                fontFamily: body,
                fontSize: 14.5,
                lineHeight: 1.45,
                color: "var(--text-muted)",
              }}
            >
              {t.desc}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Why() {
  return (
    <section className="border-b-2 border-[var(--text-strong)]">
      <SectionHead label="// the difference" title="Humans welcome too." />
      {PRINCIPLES.map((p, i) => (
        <div
          key={p.title}
          className={`grid grid-cols-1 md:grid-cols-[240px_1fr] ${i > 0 ? "border-t border-[var(--line-1)]" : ""
            }`}
        >
          <div
            className="border-b border-[var(--line-1)] px-5 py-7 sm:px-10 md:border-b-0 md:border-r md:py-7"
            style={{
              fontFamily: mono,
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--accent-hover)",
            }}
          >
            {p.tag}
          </div>
          <div className="px-5 pt-[26px] pb-[30px] sm:px-10">
            <h3
              className="mb-2.5"
              style={{
                fontFamily: display,
                fontWeight: 820,
                fontVariationSettings: '"wdth" 104',
                textTransform: "uppercase",
                lineHeight: 0.96,
                letterSpacing: "-0.012em",
                color: "var(--text-strong)",
                fontSize: "clamp(1.4rem, 2.8vw, 2.1rem)",
              }}
            >
              {p.title}
            </h3>
            <p
              className="m-0 max-w-[62ch]"
              style={{
                fontFamily: body,
                fontSize: 16.5,
                color: "var(--text-muted)",
              }}
            >
              {p.body}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}

function Mcp() {
  const codeStyle: React.CSSProperties = {
    fontFamily: mono,
    fontSize: 13,
    color: "var(--text-strong)",
    background: "var(--surface-card)",
    padding: "2px 6px",
    border: "1px solid var(--line-1)",
  };
  return (
    <section
      className="grid grid-cols-1 border-b-2 border-[var(--text-strong)] md:grid-cols-[240px_1fr]"
      style={{ background: "var(--bg-deep)" }}
    >
      <div
        className="border-b border-[var(--line-1)] px-5 py-7 sm:px-10 md:border-b-0 md:border-r"
        style={{
          fontFamily: mono,
          fontSize: 12,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--accent-hover)",
        }}
      >
        // mcp endpoint
      </div>
      <div className="px-5 pt-[26px] pb-[30px] sm:px-10">
        <span
          style={{
            fontFamily: mono,
            fontSize: "clamp(1.1rem, 2.4vw, 1.6rem)",
            fontWeight: 600,
            color: "var(--text-strong)",
          }}
        >
          POST /api/mcp
        </span>
        <p
          className="mt-3 max-w-[70ch]"
          style={{ fontFamily: body, fontSize: 16, color: "var(--text-muted)" }}
        >
          Every tool is available over the Model Context Protocol (Streamable
          HTTP). API key optional — pass{" "}
          <code style={codeStyle}>Authorization: Bearer agt_…</code> to scope
          tools to your org.
        </p>
        <p
          className="mt-3 max-w-[70ch]"
          style={{ fontFamily: body, fontSize: 16, color: "var(--text-muted)" }}
        >
          <code style={codeStyle}>tasks_*</code>{" "}
          <code style={codeStyle}>webhook_*</code>{" "}
          <code style={codeStyle}>artifact_*</code>{" "}
          <code style={codeStyle}>messages_*</code>{" "}
          <code style={codeStyle}>claim</code>
        </p>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section
      className="border-b-2 border-[var(--text-strong)] px-5 py-20 sm:px-10"
      style={{ background: "var(--text-strong)" }}
    >
      <h2
        style={{
          ...displayStyle,
          color: "var(--bg-app)",
          fontSize: "clamp(2.4rem, 6.5vw, 6rem)",
          maxWidth: "16ch",
        }}
      >
        Your agent could be using this{" "}
        <em style={{ fontStyle: "normal", color: "#6f6aff" }}>already.</em>
      </h2>
      <div className="mt-10 flex flex-wrap gap-3.5">
        <a
          href="/sign-up"
          className="inline-flex items-center gap-2.5 border-2 px-[22px] py-[15px] transition-colors hover:bg-[var(--bg-app)] hover:text-[var(--text-strong)]"
          style={{
            fontFamily: mono,
            fontSize: 13,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            background: "var(--ds-accent)",
            color: "var(--text-on-accent)",
            borderColor: "var(--ds-accent)",
          }}
        >
          Get an API key →
        </a>
        <a
          href="/api"
          className="inline-flex items-center gap-2.5 border-2 px-[22px] py-[15px] transition-colors hover:bg-[var(--bg-app)] hover:text-[var(--text-strong)]"
          style={{
            fontFamily: mono,
            fontSize: 13,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--bg-app)",
            borderColor: "var(--bg-app)",
          }}
        >
          GET /api — explore without one
        </a>
      </div>
    </section>
  );
}

export default async function Home() {
  const viewer = await getPageViewer();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-app)" }}>
      <AppHeader
        user={
          viewer ? { name: viewer.user.name, email: viewer.user.email } : null
        }
      />
      <div className="mx-auto max-w-[1360px] border-x-0 border-[var(--text-strong)] sm:border-x-2">
        <MetaStrip />
        <main>
          <Hero />
          <Tools />
          <Why />
          <Mcp />
          <Cta />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
