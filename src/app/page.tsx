import { ArrowRight, BookOpen, Braces, Plug, Zap, ShieldCheck, ListChecks, Webhook, Radio, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" width={size} height={size} aria-hidden>
      <g stroke="var(--ds-accent)" strokeWidth="2.4" strokeLinecap="round">
        <path d="M24 24 V9" />
        <path d="M24 24 L11 33" />
        <path d="M24 24 L37 33" />
      </g>
      <g fill="var(--ds-accent)">
        <circle cx="24" cy="8" r="4" />
        <circle cx="10" cy="34" r="4" />
        <circle cx="38" cy="34" r="4" />
      </g>
      <rect x="18" y="18" width="12" height="12" rx="3.5" fill="var(--bg-app)" stroke="var(--ds-accent)" strokeWidth="2.4" />
    </svg>
  );
}

function SiteHeader() {
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
      <a
        href="/"
        className="inline-flex items-center gap-2.5 text-lg font-semibold no-underline"
        style={{ color: "var(--text-strong)", letterSpacing: "-0.02em" }}
      >
        <Logo size={26} />
        <span>agtools</span>
      </a>
      <nav className="flex gap-5 ml-3">
        {["Tools", "Docs", "Pricing", "Changelog"].map((item) => (
          <a
            key={item}
            href="#"
            className="text-sm transition-colors no-underline"
            style={{ color: "var(--text-muted)" }}
          >
            {item}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-5">
        <a
          href="#"
          className="text-sm no-underline transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          Sign in
        </a>
        <a
          href="#"
          className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded no-underline transition-colors"
          style={{
            background: "var(--ds-accent)",
            color: "var(--text-on-accent)",
          }}
        >
          Get API key <ArrowRight size={14} />
        </a>
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
          // MCP · HTTP · CLI
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
          Tools for agents.<br />
          <em style={{ color: "var(--ds-accent)", fontStyle: "italic" }}>One endpoint</em> they can call.
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
          Connect tasks, webhooks and more. Your agent gets typed actions
          over MCP or plain HTTP — no SDKs, no glue code.
        </p>
        <div className="flex gap-4 justify-center mt-9">
          <a
            href="#"
            className="inline-flex items-center gap-2 font-semibold px-5 py-3.5 rounded no-underline transition-colors text-sm"
            style={{
              fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
              background: "var(--ds-accent)",
              color: "var(--text-on-accent)",
            }}
          >
            Get your API key <ArrowRight size={15} />
          </a>
          <a
            href="#"
            className="inline-flex items-center gap-2 text-sm px-5 py-3.5 rounded no-underline transition-colors"
            style={{
              fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
              color: "var(--text-body)",
              border: "1px solid var(--line-2)",
            }}
          >
            <BookOpen size={15} /> Read the docs
          </a>
        </div>

        {/* Terminal block */}
        <div
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
            <span style={{ color: "var(--ds-accent)" }}>agtools</span>{" connect stripe --scope read\n"}
            <span style={{ color: "var(--text-faint)" }}>✓ connected · 14 tools exposed{"\n\n"}</span>
            <span style={{ color: "var(--text-faint)" }}>$</span>{" "}
            <span style={{ color: "var(--ds-accent)" }}>agtools</span>{" tools list --json\n"}
            {"{\n  "}
            <span style={{ color: "var(--amber-400)" }}>&quot;stripe.charges.create&quot;</span>
            {': { "args": 6, "scope": "write" },\n  '}
            <span style={{ color: "var(--amber-400)" }}>&quot;stripe.refunds.list&quot;</span>
            {':  { "args": 3, "scope": "read"  }\n}'}
          </pre>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: <Braces size={20} />,
    title: "Typed by default",
    body: "Every tool ships a JSON schema, so agents never guess an argument or fumble a call.",
  },
  {
    icon: <Plug size={20} />,
    title: "One auth model",
    body: "Connect once. Scope per tool. Rotate keys without touching a single line of agent code.",
  },
  {
    icon: <Zap size={20} />,
    title: "12ms p50",
    body: "A thin, regional proxy in front of every integration. Calls return before your agent blinks.",
  },
  {
    icon: <ShieldCheck size={20} />,
    title: "Audited & scoped",
    body: "Read, write or admin per tool. Every invocation is logged, attributable and revocable.",
  },
];

function Features() {
  return (
    <section className="max-w-5xl mx-auto px-8 py-20">
      <div className="mb-10">
        <span className="eyebrow" style={{ color: "var(--ds-accent)" }}>
          // Why agtools
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
    cat: "task management",
    badge: "live",
    path: "/api/tasks",
    desc: "Create task containers, add subtasks, track status and priority.",
  },
  {
    icon: <Webhook size={17} />,
    name: "Webhooks",
    cat: "event capture",
    badge: "live",
    path: "/api/webhooks",
    desc: "Receive, store, and inspect inbound webhooks.",
  },
  {
    icon: <Radio size={17} />,
    name: "Pub/Sub",
    cat: "messaging",
    badge: "soon",
    path: "/api/channels",
    desc: "Publish messages and subscribe via webhook or poll.",
  },
  {
    icon: <FileText size={17} />,
    name: "Gist",
    cat: "storage",
    badge: "soon",
    path: "/api/gists",
    desc: "Store and retrieve text blobs with a key.",
  },
];

function Tools() {
  return (
    <section
      className="py-20"
      style={{ borderTop: "1px solid var(--line-1)" }}
    >
      <div className="max-w-5xl mx-auto px-8">
        <div className="mb-10">
          <span className="eyebrow" style={{ color: "var(--ds-accent)" }}>
            // available tools
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
    <section className="max-w-5xl mx-auto px-8 pb-20">
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
          All tools are available via the Model Context Protocol. Pass your API key as{" "}
          <code
            style={{
              fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
              fontSize: "13px",
              color: "var(--gray-300)",
            }}
          >
            Authorization: Bearer agt_live_…
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
            maxWidth: "14ch",
            margin: 0,
          }}
        >
          Give your agent something to do.
        </h2>
        <a
          href="#"
          className="inline-flex items-center gap-2 font-semibold px-5 py-3.5 rounded no-underline transition-colors text-sm"
          style={{
            fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
            background: "var(--ds-accent)",
            color: "var(--text-on-accent)",
          }}
        >
          Get your API key <ArrowRight size={15} />
        </a>
      </div>
    </section>
  );
}

function AuthNote() {
  return (
    <div className="max-w-5xl mx-auto px-8 pb-8">
      <p
        style={{
          fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
          fontSize: "12px",
          color: "var(--text-faint)",
          margin: 0,
        }}
      >
        No API key? Resources are public by default — anyone with the ID can read and write.
        Create a project to own your resources.
      </p>
    </div>
  );
}

const FOOTER_COLS = [
  { title: "Product", links: ["Tools", "Pricing", "Status"] },
  { title: "Developers", links: ["Docs", "API", "MCP"] },
  { title: "Company", links: ["About", "Blog", "Changelog"] },
];

function SiteFooter() {
  return (
    <footer
      className="py-14"
      style={{ borderTop: "1px solid var(--line-1)" }}
    >
      <div className="max-w-5xl mx-auto px-8 flex justify-between gap-10 flex-wrap">
        <div>
          <a
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
            <Logo size={22} /> agtools
          </a>
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
            Tools for agents. One endpoint to call them all.
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
                  key={link}
                  href="#"
                  className="block mb-2.5 no-underline transition-colors text-sm"
                  style={{
                    fontFamily: "var(--font-spline-mono, ui-monospace, monospace)",
                    color: "var(--text-muted)",
                  }}
                >
                  {link}
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
        <AuthNote />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}
