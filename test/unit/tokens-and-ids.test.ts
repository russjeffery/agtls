/**
 * Unit tests for:
 *   src/lib/agent-auth/tokens.ts  — claim/OTP tokens, sha256, hashesEqual
 *   src/lib/api/ids.ts            — newId, newApiKey, newUserId
 */
import { describe, it, expect } from "vitest";
import {
  newClaimToken,
  newClaimViewToken,
  newOtp,
  sha256,
  hashesEqual,
} from "@/lib/agent-auth/tokens";
import { newId, newApiKey, newUserId } from "@/lib/api/ids";

// ─── tokens.ts ─────────────────────────────────────────────────────────────

describe("newClaimToken", () => {
  it("has prefix clm_", () => {
    expect(newClaimToken()).toMatch(/^clm_/);
  });

  it("has total length 29 (clm_ = 4 + 25 base62 chars)", () => {
    // smoke.ts asserts length === 4 + 25
    expect(newClaimToken().length).toBe(4 + 25);
  });

  it("produces unique values across calls", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => newClaimToken()));
    expect(tokens.size).toBe(20);
  });
});

describe("newClaimViewToken", () => {
  it("has prefix cvt_", () => {
    expect(newClaimViewToken()).toMatch(/^cvt_/);
  });

  it("has total length 36 (cvt_ = 4 + 32 base62 chars)", () => {
    // The source does base62(32) so total = 4 + 32 = 36
    expect(newClaimViewToken().length).toBe(4 + 32);
  });

  it("produces unique values across calls", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => newClaimViewToken()));
    expect(tokens.size).toBe(20);
  });
});

describe("newOtp", () => {
  it("matches /^\\d{6}$/", () => {
    for (let i = 0; i < 50; i++) {
      expect(newOtp()).toMatch(/^\d{6}$/);
    }
  });

  it("produces values within 000000..999999", () => {
    for (let i = 0; i < 50; i++) {
      const n = parseInt(newOtp(), 10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });

  it("pads single-digit values with leading zeros", () => {
    // We can't force the CSPRNG, but the format assertion over many samples
    // statistically proves padding. The /^\d{6}$/ test above covers it.
    const samples = Array.from({ length: 100 }, () => newOtp());
    expect(samples.every((s) => s.length === 6)).toBe(true);
  });
});

describe("sha256", () => {
  it("returns a hex string", () => {
    const h = sha256("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input produces same output", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
  });

  it("differs for different inputs", () => {
    expect(sha256("x")).not.toBe(sha256("y"));
  });

  it("returns known SHA-256 of empty string", () => {
    // Well-known value
    expect(sha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});

describe("hashesEqual", () => {
  it("returns true for equal digests", () => {
    const h = sha256("hello");
    expect(hashesEqual(h, h)).toBe(true);
  });

  it("returns true for two independently computed equal digests", () => {
    expect(hashesEqual(sha256("world"), sha256("world"))).toBe(true);
  });

  it("returns false for different digests of the same length", () => {
    expect(hashesEqual(sha256("x"), sha256("y"))).toBe(false);
  });

  it("returns false when lengths differ", () => {
    // Different-length strings — hashesEqual should short-circuit on length
    expect(hashesEqual("abc", "abcd")).toBe(false);
  });
});

// ─── ids.ts ─────────────────────────────────────────────────────────────────

describe("newId – prefixes", () => {
  const cases: Array<[Parameters<typeof newId>[0], string]> = [
    ["organization", "org_"],
    ["member", "mem_"],
    ["apiKey", "agt_"],
    ["task", "tsk_"],
    ["subtask", "sub_"],
    ["webhookEndpoint", "wh_"],
    ["webhookEvent", "whe_"],
    ["agentRegistration", "reg_"],
    ["agentAuditEvent", "evt_"],
    ["claimAttempt", "cla_"],
  ];

  for (const [type, prefix] of cases) {
    it(`${type} → starts with '${prefix}'`, () => {
      expect(newId(type)).toMatch(new RegExp(`^${prefix.replace("_", "\\_")}`));
    });

    it(`${type} → prefix + underscore + 24 nanoid chars`, () => {
      const id = newId(type);
      // After the fixed prefix (e.g. "prj_"), the remaining 24 chars are nanoid
      expect(id.length).toBe(prefix.length + 24);
    });
  }
});

describe("newApiKey", () => {
  it("has prefix agt_", () => {
    expect(newApiKey()).toMatch(/^agt_/);
  });

  it("is agt_ (4 chars) + 24 nanoid chars = 28 total", () => {
    expect(newApiKey().length).toBe("agt_".length + 24);
  });

  it("produces unique values", () => {
    const keys = new Set(Array.from({ length: 20 }, () => newApiKey()));
    expect(keys.size).toBe(20);
  });
});

describe("newUserId", () => {
  it("has length 32", () => {
    expect(newUserId().length).toBe(32);
  });

  it("produces unique values", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newUserId()));
    expect(ids.size).toBe(20);
  });
});
