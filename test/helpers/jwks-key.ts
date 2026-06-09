// Holds the public key that the mocked `@/lib/agent-auth/jwks` hands back to
// jose during ID-JAG / logout-token verification. The agent-auth helper sets
// this to the in-memory test provider's public key. Kept in its own tiny module
// so the vi.mock factory (which is hoisted) can import it safely.
let publicKey: unknown = null;

export function setPublicKey(key: unknown): void {
  publicKey = key;
}

export function getPublicKey(): unknown {
  return publicKey;
}
