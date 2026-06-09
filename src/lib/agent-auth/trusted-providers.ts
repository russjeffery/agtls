// Trust list of agent providers whose ID-JAG / logout-token assertions we
// accept. This is SECURITY-CRITICAL configuration — compromising a trusted
// provider compromises every delegation routed through it. Changes should be
// audited and rolled out with the same care as any auth config change.
//
// Sourced from the AGENT_AUTH_TRUSTED_PROVIDERS env var (JSON array). In a
// real deployment this would live in audited config / a DB table; keeping it
// as parsed config avoids a DB seed step and keeps the trust decision in one
// reviewable place.

export interface TrustedProvider {
  /** Issuer URL — must exactly match the ID-JAG `iss` claim. */
  iss: string;
  /** Human label for logs / audit events. */
  name?: string;
  /** JWKS endpoint. Defaults to `{iss}/.well-known/jwks.json`. */
  jwksUri?: string;
  /**
   * Expected `client_id`. If a URL, it's treated as a Client ID Metadata
   * Document (CIMD) and resolved; otherwise compared as an opaque value.
   * When omitted, any client_id that is a non-empty string is accepted.
   */
  clientId?: string;
}

let cached: Map<string, TrustedProvider> | null = null;

function load(): Map<string, TrustedProvider> {
  if (cached) return cached;
  const map = new Map<string, TrustedProvider>();
  const raw = process.env.AGENT_AUTH_TRUSTED_PROVIDERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as TrustedProvider[];
      for (const p of parsed) {
        if (p?.iss) map.set(normalizeIss(p.iss), p);
      }
    } catch {
      // Misconfigured trust list → empty (fail closed for agent-verified).
      console.error(
        "[agent-auth] AGENT_AUTH_TRUSTED_PROVIDERS is not valid JSON; treating trust list as empty."
      );
    }
  }
  cached = map;
  return map;
}

function normalizeIss(iss: string): string {
  return iss.replace(/\/$/, "");
}

export function resolveProvider(iss: string): TrustedProvider | undefined {
  return load().get(normalizeIss(iss));
}

export function jwksUriFor(provider: TrustedProvider): string {
  return (
    provider.jwksUri ??
    `${normalizeIss(provider.iss)}/.well-known/jwks.json`
  );
}

/** Test-only: reset the memoized trust list after mutating env. */
export function _resetTrustListCache(): void {
  cached = null;
}
