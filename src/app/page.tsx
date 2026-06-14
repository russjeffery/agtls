import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import styles from "./page.module.css";

const GITHUB = "https://github.com/russjeffery/agtls";

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
        <a href="/api/openapi.json">/api/openapi.json</a>.
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

async function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.brandMark} aria-hidden />
        AGTLS
      </Link>
      <nav className={styles.nav}>
        <a className={styles.navLink} href="#tools">
          Tools
        </a>
        <a className={styles.navLink} href="/api">
          Docs
        </a>
        {signedIn ? (
          <a className={`${styles.navLink} ${styles.headerCta}`} href="/dashboard">
            Dashboard →
          </a>
        ) : (
          <a className={`${styles.navLink} ${styles.headerCta}`} href="/sign-up">
            Get API key →
          </a>
        )}
      </nav>
    </header>
  );
}

function MetaStrip() {
  return (
    <div className={styles.meta}>
      <span className={styles.metaItem}>
        <b>Agent Tools</b>
      </span>
      <span className={styles.metaItem}>
        Rev <b>0.1</b>
      </span>
      <span className={styles.metaItem}>
        Status <span className={styles.dot} aria-hidden /> <b>Live</b>
      </span>
      <span className={`${styles.metaItem} ${styles.metaSpacer}`} />
      <span className={styles.metaItem}>MCP Ready</span>
    </div>
  );
}

function Hero() {
  return (
    <section className={styles.hero}>
      <span className={styles.eyebrow}>
        REST · MCP · No key required
      </span>
      <h1 className={styles.heroTitle}>
        <span className={styles.line}>
          <span>Simple <br />tools</span>
        </span>
        <span className={styles.line}>
          <span>
            for
            <span className={styles.line}><em>agents</em></span>
          </span>
        </span>
      </h1>

      <div className={styles.heroLower}>
        <div className={styles.heroLeft}>
          <p className={styles.dek}>
            Tasks, artifacts, scheduled wake-ups, and webhook catchers your
            agent reaches over plain HTTP or MCP. No auth, unless you want to save them.
          </p>
          <div className={styles.actions}>
            <a className={`${styles.btn} ${styles.btnPrimary}`} href="#curl">
              Start with one curl →
            </a>
            <a className={`${styles.btn} ${styles.btnGhost}`} href="/api">
              Read the API docs
            </a>
          </div>
        </div>

        <div className={styles.heroRight} id="curl">
          <div className={styles.spec}>
            <div className={styles.specHead}>
              <span className={styles.method}>POST</span>
              <span className={styles.specPath}>/api/tasks</span>
              <span className={styles.specBadge}>
                <span className={styles.dot} aria-hidden /> 200 OK
              </span>
            </div>
            <pre className={styles.code}>
              <span className={styles.dim}>$ </span>
              <span className={styles.cmd}>curl</span>
              {" -X POST https://agtls.dev/api/tasks \\\n"}
              {"    -d '"}
              {'{"name":"Review PR #142","priority":"high"}'}
              {"'\n\n{\n  "}
              <span className={styles.key}>&quot;id&quot;</span>
              {': "tsk_8f2k1xQz",\n  '}
              <span className={styles.key}>&quot;object&quot;</span>
              {': "task",\n  '}
              <span className={styles.key}>&quot;status&quot;</span>
              {': "pending",\n  '}
              <span className={styles.key}>&quot;claim_url&quot;</span>
              {': "/api/claim/tsk_8f2k1xQz"\n}\n\n'}
              <span className={styles.dim}>
                # No key. No signup. Claim it into your org later.
              </span>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tools() {
  return (
    <section id="tools">
      <div className={styles.sectionHead}>
        <span className={styles.label}>// available now</span>
        <h2>Four tools. Zero setup.</h2>
      </div>
      <div className={styles.toolGrid}>
        {TOOLS.map((t) => (
          <Link key={t.name} href={t.href} className={styles.tool}>
            <div className={styles.toolTop}>
              <span className={styles.toolStatus}>
                <span className={styles.dot} aria-hidden /> Live
              </span>
              <span className={styles.toolArrow}>Open →</span>
            </div>
            <span className={styles.toolName}>{t.name}</span>
            <span className={styles.toolPath}>{t.path}</span>
            <span className={styles.toolDesc}>{t.desc}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Why() {
  return (
    <section className={styles.why}>
      <div className={styles.sectionHead}>
        <span className={styles.label}>// the difference</span>
        <h2>Humans welcome too.</h2>
      </div>
      {PRINCIPLES.map((p) => (
        <div key={p.title} className={styles.whyRow}>
          <div className={styles.whyTag}>{p.tag}</div>
          <div className={styles.whyBody}>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

function Mcp() {
  return (
    <section className={styles.mcp}>
      <div className={styles.whyTag}>// mcp endpoint</div>
      <div className={styles.mcpBody}>
        <span className={styles.mcpEndpoint}>POST /api/mcp</span>
        <p>
          Every tool is available over the Model Context Protocol (Streamable
          HTTP). API key optional — pass{" "}
          <code>Authorization: Bearer agt_…</code> to scope tools to your org.
        </p>
        <p>
          <code>tasks_*</code> &nbsp; <code>webhook_*</code> &nbsp;{" "}
          <code>artifact_*</code> &nbsp; <code>messages_*</code> &nbsp;{" "}
          <code>claim</code>
        </p>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className={styles.cta}>
      <h2 className={styles.display}>
        Your agent could be using this <em>already.</em>
      </h2>
      <div className={styles.ctaActions}>
        <a className={`${styles.btn} ${styles.ctaPrimary}`} href="/sign-up">
          Get an API key →
        </a>
        <a className={`${styles.btn} ${styles.ctaGhost}`} href="/api">
          GET /api — explore without one
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footCell}>
        <div className={styles.footBrand}>AGTLS</div>
        <p className={styles.footNote}>
          Open-source infrastructure for AI agents. MIT licensed.
        </p>
      </div>
      <div className={styles.footCell}>
        <div className={styles.footHead}>Product</div>
        <a className={styles.footLink} href="#tools">
          Tools
        </a>
        <Link className={styles.footLink} href="/dashboard">
          Dashboard
        </Link>
      </div>
      <div className={styles.footCell}>
        <div className={styles.footHead}>Developers</div>
        <a className={styles.footLink} href="/api">
          API reference
        </a>
        <a className={styles.footLink} href="/api/openapi.json">
          OpenAPI spec
        </a>
      </div>
      <div className={styles.footCell}>
        <div className={styles.footHead}>Project</div>
        <a className={styles.footLink} href={GITHUB}>
          GitHub
        </a>
        <a className={styles.footLink} href={`${GITHUB}/blob/main/LICENSE`}>
          License
        </a>
      </div>
    </footer>
  );
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className={styles.page}>
      <Header signedIn={!!session} />
      <div className={styles.frame}>
        <MetaStrip />
        <main>
          <Hero />
          <Tools />
          <Why />
          <Mcp />
          <Cta />
        </main>
        <Footer />
      </div>
    </div>
  );
}
