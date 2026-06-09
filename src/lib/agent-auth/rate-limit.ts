import { AgentAuthError } from "./errors";

// Two-tier sliding-window rate limiting for POST /agent/auth, checked per-IP
// first, then per-tenant. Defaults follow the spec's guidance.
//
// NOTE: this is an in-process implementation. It is correct for a single
// instance but NOT shared across replicas — a production deployment should
// back this with Redis (or similar) so the window is global. It fails OPEN: if
// anything goes wrong we allow the request rather than block legitimate
// traffic. If no IP is available, the per-IP check is skipped.

interface Limits {
  perIp: number;
  perTenant: number;
}

const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const DEFAULTS: Record<"anonymous" | "identity_assertion", Limits> = {
  anonymous: { perIp: 5, perTenant: 100 },
  identity_assertion: { perIp: 60, perTenant: 1000 },
};

const hits = new Map<string, number[]>();

function check(key: string, limit: number, now: number): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}

/** Test-only: clear the in-process sliding-window counters. */
export function _resetRateLimit(): void {
  hits.clear();
}

export function enforceRateLimit(
  category: "anonymous" | "identity_assertion",
  opts: { ip?: string | null; tenant?: string }
): void {
  try {
    const now = Date.now();
    const limits = DEFAULTS[category];
    if (opts.ip) {
      if (!check(`ip:${category}:${opts.ip}`, limits.perIp, now)) {
        throw new AgentAuthError("rate_limited", "Too many requests from this source.");
      }
    }
    const tenant = opts.tenant ?? "global";
    if (!check(`tenant:${category}:${tenant}`, limits.perTenant, now)) {
      throw new AgentAuthError("rate_limited", "Rate limit exceeded.");
    }
  } catch (err) {
    if (err instanceof AgentAuthError) throw err;
    // Fail open on unexpected store errors.
  }
}
