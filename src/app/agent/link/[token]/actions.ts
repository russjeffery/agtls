"use server";

import { completeDirectClaim } from "@/lib/agent-auth/service";
import { AgentAuthError } from "@/lib/agent-auth/errors";
import { getPageViewer } from "@/lib/api/page-viewer";

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: "signed_out" | "unavailable" };

// Server action invoked when the signed-in human confirms the claim. Ownership
// of the agent's org transfers to them and the agent's credential is upgraded
// (see completeDirectClaim). Requires a session — the human's identity is the
// authorization, so we re-read it server-side rather than trusting the client.
export async function claimAgentAction(token: string): Promise<ClaimResult> {
  const viewer = await getPageViewer();
  if (!viewer) return { ok: false, reason: "signed_out" };

  try {
    await completeDirectClaim(token, viewer.user.id);
    return { ok: true };
  } catch (e) {
    if (e instanceof AgentAuthError) return { ok: false, reason: "unavailable" };
    throw e;
  }
}
