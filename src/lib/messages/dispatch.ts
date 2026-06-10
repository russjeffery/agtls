import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduledMessage } from "@/lib/db/schema";

// Delivery engine for scheduled messages. There is no background worker in a
// serverless deployment, so an external scheduler (Vercel Cron, a system cron
// hitting POST /api/messages/dispatch, etc.) drives this on an interval. Each
// call claims due messages, fires them, and records the outcome.

export interface DispatchResult {
  id: string;
  status: "delivered" | "failed";
  response_status?: number;
  error?: string;
}

export interface DispatchSummary {
  dispatched: number;
  delivered: number;
  failed: number;
  results: DispatchResult[];
}

export interface DispatchOptions {
  /** Treat this as "now" when selecting due messages. Defaults to new Date(). */
  now?: Date;
  /** Max messages to process in one run. Defaults to 25. */
  limit?: number;
  /** Override the HTTP client (tests inject a stub). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

// Bodies are only sent for methods that carry one.
function methodHasBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

/**
 * Deliver every message whose scheduled time has passed. Each message is first
 * atomically moved scheduled→delivering (a conditional update that only one
 * concurrent dispatcher can win), so overlapping cron runs never double-send.
 */
export async function dispatchDueMessages(
  opts: DispatchOptions = {}
): Promise<DispatchSummary> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 25;
  const doFetch = opts.fetchImpl ?? fetch;

  const due = await db
    .select()
    .from(scheduledMessage)
    .where(
      and(
        eq(scheduledMessage.status, "scheduled"),
        lte(scheduledMessage.scheduledAt, now)
      )
    )
    .orderBy(asc(scheduledMessage.scheduledAt))
    .limit(limit);

  const results: DispatchResult[] = [];

  for (const msg of due) {
    // Claim the message so a concurrent dispatcher can't pick it up too.
    const [claimed] = await db
      .update(scheduledMessage)
      .set({ status: "delivering", updatedAt: new Date() })
      .where(
        and(
          eq(scheduledMessage.id, msg.id),
          eq(scheduledMessage.status, "scheduled")
        )
      )
      .returning({ id: scheduledMessage.id });
    if (!claimed) continue;

    const attemptAt = new Date();
    let status: "delivered" | "failed" = "failed";
    let responseStatus: number | null = null;
    let lastError: string | null = null;

    try {
      const res = await doFetch(msg.url, {
        method: msg.method,
        headers: msg.headers ?? undefined,
        body: methodHasBody(msg.method) ? msg.body ?? undefined : undefined,
      });
      responseStatus = res.status;
      if (res.ok) {
        status = "delivered";
      } else {
        lastError = `Target responded with HTTP ${res.status}.`;
      }
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : "Request failed.";
    }

    await db
      .update(scheduledMessage)
      .set({
        status,
        attempts: msg.attempts + 1,
        responseStatus,
        lastError,
        deliveredAt: attemptAt,
        updatedAt: new Date(),
      })
      .where(eq(scheduledMessage.id, msg.id));

    results.push({
      id: msg.id,
      status,
      ...(responseStatus !== null ? { response_status: responseStatus } : {}),
      ...(lastError ? { error: lastError } : {}),
    });
  }

  return {
    dispatched: results.length,
    delivered: results.filter((r) => r.status === "delivered").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}
