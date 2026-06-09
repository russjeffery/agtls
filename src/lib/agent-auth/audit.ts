import { db } from "@/lib/db";
import { agentAuditEvent } from "@/lib/db/schema";
import { newId } from "@/lib/api/ids";

// Append-only audit log for agent-auth state transitions. The set of events
// and the fields they carry is the useful baseline from the spec; how they're
// surfaced (admin API, webhook, SIEM) is left open. Recording is best-effort:
// a logging failure must never break the auth flow.

export type AgentAuditType =
  | "registration.created"
  | "claim.requested"
  | "otp.generated"
  | "claim.confirmed"
  | "registration.expired"
  | "registration.revoked";

export async function recordAuditEvent(
  type: AgentAuditType,
  fields: { registrationId?: string; data?: Record<string, unknown> } = {}
): Promise<void> {
  try {
    await db.insert(agentAuditEvent).values({
      id: newId("agentAuditEvent"),
      type,
      registrationId: fields.registrationId ?? null,
      data: fields.data ?? null,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("[agent-auth] failed to record audit event", type, err);
  }
}
