import { db } from "@/lib/db";
import { agentAssertionJti } from "@/lib/db/schema";

// Atomic check-and-set on the shared jti replay cache. Returns true if the jti
// was previously unseen (insert succeeded), false on collision. The unique PK
// + ON CONFLICT DO NOTHING makes this safe under concurrency and across
// replicas. A periodic sweep should delete rows past expiresAt; an indexed TTL
// column keeps that cheap (left to a scheduled job — see expireRegistrations).

export async function markJtiSeen(
  jti: string,
  expiresAt: Date
): Promise<boolean> {
  const inserted = await db
    .insert(agentAssertionJti)
    .values({ jti, expiresAt, createdAt: new Date() })
    .onConflictDoNothing({ target: agentAssertionJti.jti })
    .returning({ jti: agentAssertionJti.jti });
  return inserted.length > 0;
}
