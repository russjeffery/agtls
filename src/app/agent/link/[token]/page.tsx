import { getDirectClaimView } from "@/lib/agent-auth/service";
import { getPageViewer } from "@/lib/api/page-viewer";
import { ClaimAgentButton } from "./ClaimAgentButton";

// Human-facing direct-claim page. An agent pastes this link (claimLinkUrl) to
// its human. The human signs up / signs in, then confirms ownership in-session
// — no email round-trip, no one-time code. This is the counterpart to the OTP
// page at /agent/claim/[token]: there the human reads a code back to the agent;
// here the human's own session authorizes the claim.
//
// The GET render is READ-ONLY (getDirectClaimView mints nothing), so email/chat
// link scanners that prefetch the URL can't consume or alter the claim.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

const mono = "var(--font-spline-mono, ui-monospace, monospace)";

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

export default async function ClaimLinkPage({ params }: PageProps) {
  const { token } = await params;
  const [view, viewer] = await Promise.all([
    getDirectClaimView(token),
    getPageViewer(),
  ]);

  if (!view) {
    return (
      <main style={wrapStyle}>
        <h1 style={titleStyle}>Link expired</h1>
        <p style={bodyStyle}>
          This claim link is no longer valid. It may have already been used, or
          the request may have expired. If you still want to take ownership, ask
          the agent for a new link.
        </p>
      </main>
    );
  }

  const next = `/agent/link/${token}`;

  if (!viewer) {
    return (
      <main style={wrapStyle}>
        <h1 style={titleStyle}>Claim your agent on {view.serviceName}</h1>
        <p style={bodyStyle}>
          An agent created an account on {view.serviceName} and wants you to take
          ownership of it. Sign in or create an account to claim it — the agent
          and everything it has built will move into your account.
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

  return (
    <main style={wrapStyle}>
      <h1 style={titleStyle}>Claim your agent on {view.serviceName}</h1>
      <p style={bodyStyle}>
        An agent wants to link to your {view.serviceName} account. Signed in as{" "}
        <strong style={{ color: "var(--text-strong)" }}>
          {viewer.user.email}
        </strong>
        . Confirm below to take ownership — the agent and its work move into your
        account, and you become the owner.
      </p>
      <ClaimAgentButton token={token} />
    </main>
  );
}
