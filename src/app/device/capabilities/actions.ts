"use server";

import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth/server";
import { getPageViewer } from "@/lib/api/page-viewer";

export type ApprovalResult =
  | { ok: true; action: "approve" | "deny" }
  | { ok: false; reason: "signed_out" | "invalid_code" | "unavailable" };

// Server action backing the device-authorization consent screen. The signed-in
// human approves or denies an agent's pending capability requests. The session
// (re-read server-side) is the authorization; `code` is the device user_code
// the agent surfaced, which must match the pending approval request.
export async function resolveApprovalAction(
  agentId: string,
  code: string,
  action: "approve" | "deny"
): Promise<ApprovalResult> {
  const viewer = await getPageViewer();
  if (!viewer) return { ok: false, reason: "signed_out" };

  try {
    await auth.api.approveCapability({
      body: { agent_id: agentId, user_code: code, action },
      headers: await headers(),
    });
    return { ok: true, action };
  } catch (e) {
    if (e instanceof APIError) {
      // The plugin returns INVALID_USER_CODE when the device code doesn't match.
      const code = (e.body as { code?: string } | undefined)?.code ?? "";
      if (code.includes("USER_CODE")) {
        return { ok: false, reason: "invalid_code" };
      }
      return { ok: false, reason: "unavailable" };
    }
    throw e;
  }
}
