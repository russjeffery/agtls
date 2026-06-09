import { getClaimView } from "@/lib/agent-auth/service";
import { RevealCode } from "./RevealCode";

// Server-rendered claim page. The claim email links here; the user confirms,
// reads the one-time code back to the agent, and the agent submits it to
// /agent/auth/claim/complete.
//
// The GET render is READ-ONLY — no OTP is minted here, so email link scanners
// that prefetch the link can't consume or rotate the code. The code is only
// generated when the user clicks the confirm button (a POST server action).
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

export default async function ClaimPage({ params }: PageProps) {
  const { token } = await params;
  const view = await getClaimView(token);

  const wrapStyle: React.CSSProperties = {
    maxWidth: 480,
    margin: "64px auto",
    padding: "0 20px",
    lineHeight: 1.6,
    fontFamily: "var(--font-newsreader, 'Newsreader', serif)",
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: "var(--font-newsreader, serif)",
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

  if (!view) {
    return (
      <main style={wrapStyle}>
        <h1 style={titleStyle}>Link expired</h1>
        <p style={bodyStyle}>
          This claim link is no longer valid. It may have already been used, or
          the request may have expired. If you still want to grant access, ask
          the agent to start a new request.
        </p>
      </main>
    );
  }

  return (
    <main style={wrapStyle}>
      <h1 style={titleStyle}>
        Confirm agent access to {view.serviceName}
      </h1>
      <p style={bodyStyle}>
        An agent is requesting access to your {view.serviceName} account
        {view.email ? ` (${view.email})` : ""}. If you recognize this request,
        confirm below to reveal a one-time code and read it back to the agent.
      </p>
      <RevealCode token={token} />
    </main>
  );
}
