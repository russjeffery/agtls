import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  task,
  webhookEndpoint,
  webhookEvent,
  artifact,
  scheduledMessage,
} from "@/lib/db/schema";
import { newClaimToken, sha256, hashesEqual } from "@/lib/agent-auth/tokens";
import {
  serializeTask,
  serializeWebhookEndpoint,
  serializeArtifact,
  serializeScheduledMessage,
} from "./serialize";

// Resource claim tokens reuse the agent-auth claim ceremony primitives: the
// same `clm_` token format, and only the SHA-256 hash is ever persisted. A
// token is minted when a resource is created without auth (public) and is the
// one-time proof that lets a later authenticated caller — whether their key
// came from an anonymous, service_auth, or identity_assertion agent-auth
// registration, or a dashboard-issued key — take ownership of the resource.

/** Mint a claim token for a publicly-created resource. Plaintext is returned
 *  to the creator exactly once; only the hash is stored. */
export function mintResourceClaimToken(): { token: string; hash: string } {
  const token = newClaimToken();
  return { token, hash: sha256(token) };
}

export type ClaimErrorCode =
  | "unsupported_id"
  | "not_found"
  | "already_claimed"
  | "not_claimable"
  | "invalid_claim_token";

export class ClaimError extends Error {
  constructor(public code: ClaimErrorCode, message: string) {
    super(message);
    this.name = "ClaimError";
  }
}

export interface ClaimResult {
  /** Serialized resource, post-claim. */
  data: Record<string, unknown>;
  /** Canonical API path of the claimed resource (for HTML redirects). */
  path: string;
}

interface ClaimableRow {
  organizationId: string | null;
  claimTokenHash: string | null;
}

function assertClaimable(
  resource: string,
  id: string,
  row: ClaimableRow | undefined,
  claimToken: string
): void {
  if (!row) {
    throw new ClaimError("not_found", `No ${resource} with ID '${id}' exists.`);
  }
  if (row.organizationId !== null) {
    throw new ClaimError(
      "already_claimed",
      `The ${resource} '${id}' is already owned by an organization.`
    );
  }
  if (!row.claimTokenHash) {
    throw new ClaimError(
      "not_claimable",
      `The ${resource} '${id}' has no claim token and cannot be claimed.`
    );
  }
  if (!hashesEqual(sha256(claimToken), row.claimTokenHash)) {
    throw new ClaimError("invalid_claim_token", "Unknown claim token.");
  }
}

/**
 * Transfer ownership of a publicly-created resource to `organizationId`. Dispatches
 * on the ID prefix (tsk_, wh_, art_, msg_). Verifies the claim token against the
 * stored hash, sets organization_id, and clears the token so a claim is one-shot.
 * Throws ClaimError for every failure mode.
 */
export async function claimResource(
  id: string,
  claimToken: string,
  organizationId: string
): Promise<ClaimResult> {
  const now = new Date();

  if (id.startsWith("tsk_")) {
    const [row] = await db.select().from(task).where(eq(task.id, id)).limit(1);
    assertClaimable("task", id, row, claimToken);

    const [updated] = await db
      .update(task)
      .set({ organizationId, claimTokenHash: null, updatedAt: now })
      .where(eq(task.id, id))
      .returning();

    return { data: serializeTask(updated), path: `/api/tasks/${id}` };
  }

  if (id.startsWith("wh_")) {
    const [row] = await db
      .select()
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.id, id))
      .limit(1);
    assertClaimable("webhook endpoint", id, row, claimToken);

    const [updated] = await db
      .update(webhookEndpoint)
      .set({ organizationId, claimTokenHash: null, updatedAt: now })
      .where(eq(webhookEndpoint.id, id))
      .returning();
    // organization_id on events is denormalized from the endpoint — keep it in sync.
    await db
      .update(webhookEvent)
      .set({ organizationId })
      .where(eq(webhookEvent.endpointId, id));

    return {
      data: serializeWebhookEndpoint(updated),
      path: `/api/webhooks/${id}`,
    };
  }

  if (id.startsWith("art_")) {
    const [row] = await db
      .select()
      .from(artifact)
      .where(eq(artifact.id, id))
      .limit(1);
    assertClaimable("artifact", id, row, claimToken);

    const [updated] = await db
      .update(artifact)
      .set({ organizationId, claimTokenHash: null, updatedAt: now })
      .where(eq(artifact.id, id))
      .returning();

    return { data: serializeArtifact(updated), path: `/api/artifacts/${id}` };
  }

  if (id.startsWith("msg_")) {
    const [row] = await db
      .select()
      .from(scheduledMessage)
      .where(eq(scheduledMessage.id, id))
      .limit(1);
    assertClaimable("scheduled message", id, row, claimToken);

    const [updated] = await db
      .update(scheduledMessage)
      .set({ organizationId, claimTokenHash: null, updatedAt: now })
      .where(eq(scheduledMessage.id, id))
      .returning();

    return {
      data: serializeScheduledMessage(updated),
      path: `/api/messages/${id}`,
    };
  }

  throw new ClaimError(
    "unsupported_id",
    `'${id}' is not a claimable resource ID. Expected a tsk_, wh_, art_, or msg_ ID.`
  );
}
