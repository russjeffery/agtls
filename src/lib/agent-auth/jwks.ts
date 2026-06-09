import { createRemoteJWKSet } from "jose";
import type { JWTVerifyGetKey } from "jose";

// jose's createRemoteJWKSet already handles per-kid caching, a cooldown
// between fetches, and a single refetch on kid cache-miss (provider key
// rotation). We memoize one JWKSet per JWKS URI so the cache persists across
// requests within a process.
//
// Caveat: this cache is in-process only. Across multiple replicas each holds
// its own cache, which is fine (each just fetches once). The `jti` replay
// cache, by contrast, MUST be shared — see replay.ts.

const sets = new Map<string, JWTVerifyGetKey>();

export function getRemoteKeySet(jwksUri: string): JWTVerifyGetKey {
  let set = sets.get(jwksUri);
  if (!set) {
    set = createRemoteJWKSet(new URL(jwksUri), {
      cacheMaxAge: 24 * 60 * 60 * 1000, // ceiling: 24h
      cooldownDuration: 30 * 1000, // min gap between forced refetches
    });
    sets.set(jwksUri, set);
  }
  return set;
}

/** Test-only: drop cached key sets. */
export function _resetJwksCache(): void {
  sets.clear();
}
