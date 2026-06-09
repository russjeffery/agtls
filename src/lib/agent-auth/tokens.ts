import { createHash, randomInt, randomBytes } from "crypto";

// All claim secrets are bearer tokens with no proof-of-possession, so only
// their SHA-256 hashes are ever persisted. Plaintext is returned exactly once.

const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function base62(length: number): string {
  // Rejection sampling over random bytes keeps the distribution uniform.
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte < 248) {
        // 248 = floor(256/62)*62; avoids modulo bias
        out += BASE62[byte % 62];
        if (out.length === length) break;
      }
    }
  }
  return out;
}

/** clm_ + 25 chars base62 — handed to the agent, used to start/complete claims. */
export function newClaimToken(): string {
  return `clm_${base62(25)}`;
}

/** cvt_ + 32 chars base62 — embedded in the claim email link. */
export function newClaimViewToken(): string {
  return `cvt_${base62(32)}`;
}

/** 6-digit numeric OTP from a CSPRNG. Guess-bounded by lockout, not entropy. */
export function newOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time-ish equality on hex digests of equal length. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
