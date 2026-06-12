import { ArrowRight, BookOpen, KeyRound, Plug, Braces, Users, ListChecks, Webhook, Radio, FileText, Clock, ScrollText } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { Logo } from "@/components/logo";
import { auth } from "@/lib/auth/server";
import { AccountMenu } from "@/components/account-menu";

async function SiteHeader() {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-7 px-8 py-3.5 border-b"
      style={{
        background: "oklch(0.168 0.006 248 / 0.72)",
        backdropFilter: "blur(14px)",
        borderColor: "var(--line-1)",
        fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
      }}
    >
      <Link href="/" className="inline-flex no-underline">
        <Logo height={50} />
      </Link>
      <nav className="flex gap-5 ml-3">
        {[
          { label: "Tools", href: "#tools" },
          { label: "Docs", href: "/api" },
          { label: "GitHub", href: "https://github.com/russjeffery/agtls" },
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="text-sm transition-colors no-underline"
            style={{ color: "var(--text-muted)" }}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-5">
        {session ? (
          <AccountMenu
            user={{ name: session.user.name, email: session.user.email }}
          />
        ) : (
          <>
            <a
              href="/sign-in"
              className="text-sm no-underline transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              Sign in
            </a>
            <a
              href="/sign-up"
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded no-underline transition-colors"
              style={{
                background: "var(--ds-accent)",
                color: "var(--text-on-accent)",
              }}
            >
              Get API key <ArrowRight size={14} />
            </a>
          </>
        )}
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section
      className="relative max-w-4xl mx-auto px-8 pt-24 pb-16 text-center"
    >
      {/* Radial green glow behind hero */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "-10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "900px",
          height: "500px",
          background: "radial-gradient(ellipse, oklch(0.835 0.175 153 / 0.07) 0%, transparent 65%)",
          zIndex: 0,
        }}
      />
      <div className="relative z-10">
        <span
          className="eyebrow"
          style={{ color: "var(--ds-accent)" }}
        >
          {"// REST · MCP · No signup required"}
        </span>
        <h1
          className="mt-5"
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: "clamp(48px, 6vw, 72px)",
            fontWeight: 500,
            lineHeight: 1.02,
            letterSpacing: "-0.025em",
            color: "var(--text-strong)",
          }}
        >
          Tools your agent<br />
          can use <em style={{ color: "var(--ds-accent)", fontStyle: "italic" }}>right now</em>.
        </h1>
        <p
          className="mt-6 mx-auto"
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: "20px",
            lineHeight: 1.55,
            color: "var(--text-muted)",
            maxWidth: "56ch",
          }}
        >
          Task lists, webhook catchers, artifact storage, scheduled wake-ups.
          Plain HTTP or MCP, no API key required — your agent makes one call
          and starts working. Claim its resources into your org whenever
          you&apos;re ready.
        </p>
        <div className="flex gap-4 justify-center mt-9">
          <a
            href="#curl"
            className="inline-flex items-center gap-2 font-semibold px-5 py-3.5 rounded no-underline transition-colors text-sm"
            style={{
              fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
              background: "var(--ds-accent)",
              color: "var(--text-on-accent)",
            }}
          >
            Start with one curl <ArrowRight size={15} />
          </a>
          <a
            href="/api"
            className="inline-flex items-center gap-2 text-sm px-5 py-3.5 rounded no-underline transition-colors"
            style={{
              fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
              color: "var(--text-body)",
              border: "1px solid var(--line-2)",
            }}
          >
            <BookOpen size={15} /> Read the API docs
          </a>
        </div>

        {/* Terminal block */}
        <div
          id="curl"
          className="mt-14 mx-auto text-left overflow-hidden"
          style={{
            maxWidth: "720px",
            background: "var(--bg-deep)",
            border: "1px solid var(--line-1)",
            borderRadius: "12px",
            boxShadow: "0 28px 70px oklch(0 0 0 / 0.55)",
          }}
        >
          <div
            className="flex items-center gap-3 px-3.5 py-3 border-b"
            style={{ borderColor: "var(--line-1)", background: "var(--bg-app)" }}
          >
            <span className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: "var(--ink-600)" }}
                />
              ))}
            </span>
            <span
              className="text-xs"
              style={{
                fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
                color: "var(--text-faint)",
              }}
            >
              ~/agent · zsh
            </span>
          </div>
          <pre
            className="m-0 px-5 py-5"
            style={{
              fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
              fontSize: "13px",
              lineHeight: 1.85,
              color: "var(--gray-200)",
              whiteSpace: "pre-wrap",
            }}
          >
            <span style={{ color: "var(--text-faint)" }}>$</span>{" "}
            <span style={{ color: "var(--ds-accent)" }}>curl</span>{" -X POST https://agtls.dev/api/tasks \\\n"}
            {"    -d '"}
            <span style={{ color: "var(--amber-400)" }}>{'{"name": "Review PR #142", "priority": "high"}'}</span>
            {"'\n\n{\n  "}
            <span style={{ color: "var(--amber-400)" }}>&quot;id&quot;</span>
            {': "tsk_8f2k1x",\n  '}
            <span style={{ color: "var(--amber-400)" }}>&quot;object&quot;</span>
            {': "task",\n  '}
            <span style={{ color: "var(--amber-400)" }}>&quot;status&quot;</span>
            {': "pending",\n  '}
            <span style={{ color: "var(--amber-400)" }}>&quot;claim_url&quot;</span>
            {': "/api/claim/tsk_8f2k1x"\n}\n\n'}
            <span style={{ color: "var(--text-faint)" }}># No key. No signup. Claim it into your org later.</span>
          </pre>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: <KeyRound size={20} />,
    title: "No key required",
    body: "Resources are public by default. Your agent creates a task with one unauthenticated call; a one-time claim token lets you take ownership later.",
  },
  {
    icon: <Plug size={20} />,
    title: "REST and MCP",
    body: "Every tool is a typed JSON API and an MCP tool from one endpoint. OpenAPI 3.1 spec at /api/openapi.json.",
  },
  {
    icon: <Braces size={20} />,
    title: "JSON for agents, HTML for you",
    body: "Every endpoint content-negotiates. Your agent gets JSON; you open the same URL in a browser and see the data.",
  },
  {
    icon: <Users size={20} />,
    title: "Agents are members",
    body: "Humans and agents sit in the same organization. Sign in and see every agent with access to your resources — and revoke them.",
  },
];

function Features() {
  return (
    <section className="max-w-5xl mx-auto px-8 py-20">
      <div className="mb-10">
        <span className="eyebrow" style={{ color: "var(--ds-accent)" }}>
          // humans welcome too
        </span>
        <h2
          className="mt-3"
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: "42px",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--text-strong)",
          }}
        >
          Built for things that aren&apos;t human.
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FEATURES.map((f) => (
          <article
            key={f.title}
            className="p-6 space-y-4"
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--line-1)",
              borderRadius: "8px",
              boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05)",
            }}
          >
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded"
              style={{
                background: "var(--green-soft)",
                color: "var(--ds-accent)",
              }}
            >
              {f.icon}
            </span>
            <h3
              style={{
                fontFamily: "var(--font-newsreader, serif)",
                fontSize: "22px",
                fontWeight: 500,
                color: "var(--text-strong)",
                margin: 0,
              }}
            >
              {f.title}
            </h3>
            <p
              style={{
                fontFamily: "var(--font-newsreader, serif)",
                fontSize: "16px",
                lineHeight: 1.55,
                color: "var(--text-muted)",
                margin: 0,
              }}
            >
              {f.body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

const TOOLS = [
  {
    icon: <ListChecks size={17} />,
    name: "Tasks",
    cat: "task tracking",
    badge: "live",
    path: "/api/tasks",
    desc: "Create and track work with priorities, due dates, and labels.",
  },
  {
    icon: <FileText size={17} />,
    name: "Artifacts",
    cat: "storage",
    badge: "live",
    path: "/api/artifacts",
    desc: "Markdown files an agent can write now and recall in a later session.",
  },
  {
    icon: <Clock size={17} />,
    name: "Scheduled Messages",
    cat: "scheduling",
    badge: "live",
    path: "/api/messages",
    desc: "Schedule an HTTP request for the future — wake an agent up, on time.",
  },
  {
    icon: <Webhook size={17} />,
    name: "Webhook Catcher",
    cat: "event capture",
    badge: "live",
    path: "/api/webhooks",
    desc: "A URL that catches anything sent to it. Store, list, and inspect every event.",
  }
];

function Tools() {
  return (
    <section
      id="tools"
      className="py-20"
      style={{ borderTop: "1px solid var(--line-1)" }}
    >
      <div className="max-w-5xl mx-auto px-8">
        <div className="mb-10">
          <span className="eyebrow" style={{ color: "var(--ds-accent)" }}>
            {"// available tools"}
          </span>
          <h2
            className="mt-3"
            style={{
              fontFamily: "var(--font-newsreader, serif)",
              fontSize: "42px",
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "var(--text-strong)",
            }}
          >
            If it helps agents ship, it&apos;s a tool.
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TOOLS.map((t) => (
            <div
              key={t.name}
              className="flex flex-col gap-3 p-4 transition-all"
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--line-1)",
                borderRadius: "8px",
                boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05)",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded"
                  style={{
                    background: "var(--surface-well)",
                    color: "var(--text-body)",
                    border: "1px solid var(--line-1)",
                  }}
                >
                  {t.icon}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-xs font-medium"
                  style={{
                    fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
                    background: t.badge === "live" ? "var(--green-soft)" : "var(--surface-raised)",
                    color: t.badge === "live" ? "var(--green-300)" : "var(--text-faint)",
                    ...(t.badge === "live"
                      ? {}
                      : { border: "1px solid var(--line-strong)" }),
                  }}
                >
                  {t.badge === "live" && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: "var(--ds-accent)",
                        boxShadow: "0 0 8px var(--green-glow)",
                      }}
                    />
                  )}
                  {t.badge}
                </span>
              </div>
              <div>
                <p
                  className="font-semibold m-0"
                  style={{
                    fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
                    fontSize: "14px",
                    color: "var(--text-strong)",
                  }}
                >
                  {t.name}
                </p>
                <p
                  className="m-0 mt-0.5"
                  style={{
                    fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
                    fontSize: "11px",
                    color: "var(--text-faint)",
                  }}
                >
                  {t.cat}
                </p>
              </div>
              <p
                className="text-xs m-0 flex-1"
                style={{
                  fontFamily: "var(--font-newsreader, serif)",
                  fontSize: "14px",
                  lineHeight: 1.5,
                  color: "var(--text-muted)",
                }}
              >
                {t.desc}
              </p>
              {t.badge === "live" && (
                <code
                  className="text-xs"
                  style={{
                    fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
                    color: "var(--text-faint)",
                  }}
                >
                  {t.path}
                </code>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function McpSection() {
  return (
    <section id="mcp" className="max-w-5xl mx-auto px-8 pb-20">
      <div
        className="p-6 space-y-3"
        style={{
          background: "oklch(0.835 0.175 153 / 0.05)",
          border: "1px solid oklch(0.835 0.175 153 / 0.25)",
          borderRadius: "8px",
          boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05)",
        }}
      >
        <p
          className="font-semibold m-0"
          style={{
            fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
            fontSize: "11px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ds-accent)",
          }}
        >
          MCP endpoint
        </p>
        <code
          style={{
            fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
            fontSize: "13px",
            color: "var(--gray-300)",
            display: "block",
          }}
        >
          POST /api/mcp
        </code>
        <p
          className="m-0"
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: "15px",
            color: "var(--text-muted)",
          }}
        >
          All tools are available via the Model Context Protocol (Streamable
          HTTP). API key optional — pass{" "}
          <code
            style={{
              fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
              fontSize: "13px",
              color: "var(--gray-300)",
            }}
          >
            Authorization: Bearer agt_…
          </code>{" "}
          to scope tools to your org. Tools:{" "}
          <code
            style={{
              fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
              fontSize: "13px",
              color: "var(--gray-300)",
            }}
          >
            tasks_* · webhook_* · artifact_* · messages_* · claim
          </code>
        </p>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section
      className="py-20"
      style={{
        borderTop: "1px solid var(--line-1)",
        background: "linear-gradient(180deg, transparent, oklch(0.835 0.175 153 / 0.04))",
      }}
    >
      <div className="max-w-5xl mx-auto px-8 flex items-center justify-between gap-8 flex-wrap">
        <h2
          style={{
            fontFamily: "var(--font-newsreader, serif)",
            fontSize: "42px",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            color: "var(--text-strong)",
            maxWidth: "22ch",
            margin: 0,
          }}
        >
          Your agent could be using this before you finish this sentence.
        </h2>
        <div className="flex flex-col items-start gap-3">
          <a
            href="/sign-up"
            className="inline-flex items-center gap-2 font-semibold px-5 py-3.5 rounded no-underline transition-colors text-sm"
            style={{
              fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
              background: "var(--ds-accent)",
              color: "var(--text-on-accent)",
            }}
          >
            Get an API key <ArrowRight size={15} />
          </a>
          <a
            href="/api"
            className="inline-flex items-center gap-2 text-sm px-5 py-3.5 rounded no-underline transition-colors"
            style={{
              fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
              color: "var(--text-body)",
              border: "1px solid var(--line-2)",
            }}
          >
            GET /api — explore without one
          </a>
        </div>
      </div>
    </section>
  );
}

const FOOTER_COLS = [
  {
    title: "Product",
    links: [
      { label: "Tools", href: "#tools" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "API reference", href: "/api" },
      { label: "OpenAPI spec", href: "/api/openapi.json" },
      { label: "MCP", href: "#mcp" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub", href: "https://github.com/russjeffery/agtls" },
      { label: "License", href: "https://github.com/russjeffery/agtls/blob/main/LICENSE" },
    ],
  },
];

function SiteFooter() {
  return (
    <footer
      className="py-14"
      style={{ borderTop: "1px solid var(--line-1)" }}
    >
      <div className="max-w-5xl mx-auto px-8 flex justify-between gap-10 flex-wrap">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 no-underline"
            style={{
              fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--text-strong)",
              letterSpacing: "-0.02em",
            }}
          >
            <Logo height={22} />
          </Link>
          <p
            className="mt-3.5"
            style={{
              fontFamily: "var(--font-newsreader, serif)",
              fontSize: "15px",
              color: "var(--text-faint)",
              maxWidth: "30ch",
              margin: "14px 0 0",
            }}
          >
            Open-source infrastructure for AI agents. MIT licensed.
          </p>
        </div>
        <div className="flex gap-14">
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <h4
                style={{
                  fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
                  fontSize: "11px",
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: "var(--text-faint)",
                  margin: "0 0 14px",
                  fontWeight: 500,
                }}
              >
                {col.title}
              </h4>
              {col.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="block mb-2.5 no-underline transition-colors text-sm"
                  style={{
                    fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
                    color: "var(--text-muted)",
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: `
          radial-gradient(900px 500px at 70% -5%, oklch(0.835 0.175 153 / 0.07), transparent 60%),
          var(--bg-app)
        `,
      }}
    >
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <Tools />
        <McpSection />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
