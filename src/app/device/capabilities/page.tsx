import { and, eq } from "drizzle-orm";
import { db, agent as agentTable, agentCapabilityGrant } from "@/lib/db";
import { getPageViewer } from "@/lib/api/page-viewer";
import { ApprovalButtons } from "./ApprovalButtons";

// Device-authorization approval page for the @better-auth/agent-auth plugin
// (referenced as `deviceAuthorizationPage` in the plugin config). An agent
// surfaces the URL `…/device/capabilities?agent_id=…&code=…` to its human, who
// signs in and approves or denies the requested capabilities here.
//
// The plugin does not render this UI — the GET render is read-only (it never
// resolves the approval), so a prefetching link scanner can't grant anything;
// approval happens only through the server action behind the buttons.
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ agent_id?: string; code?: string }>;
};

const wrapStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: "64px auto",
  padding: "0 20px",
  lineHeight: 1.6,
  fontFamily: "var(--font-hanken, 'Newsreader', serif)",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-hanken, serif)",
  fontSize: 28,
  fontWeight: 500,
  color: "var(--text-strong)",
  letterSpacing: "-0.02em",
  margin: "0 0 16px",
};

const bodyStyle: React.CSSProperties = {
  fontSize: 16,
  color: "var(--text-muted)",
  margin: "0 0 28px",
};

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

export default async function DeviceCapabilitiesPage({
  searchParams,
}: PageProps) {
  const { agent_id: agentId, code } = await searchParams;

  if (!agentId || !code) {
    return (
      <main style={wrapStyle}>
        <h1 style={titleStyle}>Invalid request</h1>
        <p style={bodyStyle}>
          This approval link is missing required information. Ask the agent for a
          fresh link.
        </p>
      </main>
    );
  }

  const viewer = await getPageViewer();
  const next = `/device/capabilities?agent_id=${encodeURIComponent(
    agentId
  )}&code=${encodeURIComponent(code)}`;

  if (!viewer) {
    return (
      <main style={wrapStyle}>
        <h1 style={titleStyle}>Approve an agent</h1>
        <p style={bodyStyle}>
          An agent is asking for access to your agtls account. Sign in or create
          an account to review and approve what it can do.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <a
            href={`/sign-up?next=${encodeURIComponent(next)}`}
            style={{
              fontFamily: mono,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-on-accent)",
              background: "var(--ds-accent)",
              borderRadius: 6,
              padding: "11px 20px",
              textDecoration: "none",
            }}
          >
            Create account
          </a>
          <a
            href={`/sign-in?next=${encodeURIComponent(next)}`}
            style={{
              fontFamily: mono,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-body)",
              background: "var(--surface-card)",
              border: "1px solid var(--line-2)",
              borderRadius: 6,
              padding: "11px 20px",
              textDecoration: "none",
            }}
          >
            Sign in
          </a>
        </div>
      </main>
    );
  }

  // Read-only lookup of the agent and the capabilities it's requesting. The
  // agent is still unclaimed at this point (no userId), so we query by id
  // directly rather than through auth.api.getAgent (which scopes to the caller).
  const [agentRow] = await db
    .select({ id: agentTable.id, name: agentTable.name, status: agentTable.status })
    .from(agentTable)
    .where(eq(agentTable.id, agentId))
    .limit(1);

  if (!agentRow) {
    return (
      <main style={wrapStyle}>
        <h1 style={titleStyle}>Request not found</h1>
        <p style={bodyStyle}>
          We couldn&apos;t find this agent. The request may have expired — ask
          the agent to start again.
        </p>
      </main>
    );
  }

  const pendingGrants = await db
    .select({ capability: agentCapabilityGrant.capability })
    .from(agentCapabilityGrant)
    .where(
      and(
        eq(agentCapabilityGrant.agentId, agentId),
        eq(agentCapabilityGrant.status, "pending")
      )
    );
  const capabilities = pendingGrants.map((g) => g.capability);

  return (
    <main style={wrapStyle}>
      <h1 style={titleStyle}>Approve {agentRow.name}</h1>
      <p style={bodyStyle}>
        Signed in as{" "}
        <strong style={{ color: "var(--text-strong)" }}>
          {viewer.user.email}
        </strong>
        . Approving links this agent to your account and lets it act in your
        organization with the capabilities below.
      </p>

      {capabilities.length > 0 ? (
        <div style={{ margin: "0 0 28px" }}>
          <p
            style={{
              fontFamily: mono,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-muted)",
              margin: "0 0 10px",
            }}
          >
            Requested capabilities
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {capabilities.map((cap) => (
              <li
                key={cap}
                style={{
                  fontFamily: mono,
                  fontSize: 13,
                  color: "var(--text-body)",
                  background: "var(--surface-card)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 6,
                  padding: "8px 12px",
                }}
              >
                {cap}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={bodyStyle}>
          This agent is requesting basic read access to your account.
        </p>
      )}

      <ApprovalButtons agentId={agentId} code={code} />
    </main>
  );
}
