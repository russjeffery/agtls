import { customAlphabet } from "nanoid";

// Base62 — no underscores or dashes, safe to double-click-select and URL-embed.
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const randomId = customAlphabet(ALPHABET, 16); // ~95 bits
const randomSecret = customAlphabet(ALPHABET, 24); // ~143 bits
const randomSlug = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 8);

const prefixes = {
  organization: "org",
  member: "mem",
  invitation: "inv",
  apiKey: "key",
  task: "tsk",
  webhookEndpoint: "wh",
  webhookEvent: "whe",
  artifact: "art",
  scheduledMessage: "msg",
  agentRegistration: "reg",
  agentAuditEvent: "evt",
  claimAttempt: "cla",
  // @better-auth/agent-auth plugin models (keyed by BetterAuth model name).
  agentHost: "ahost",
  agent: "agent",
  agentCapabilityGrant: "grant",
  approvalRequest: "appr",
} as const;

type Prefix = keyof typeof prefixes;

export function newId(type: Prefix): string {
  return `${prefixes[type]}_${randomId()}`;
}

export function newApiKey(): string {
  // agt_<24 chars> — shown once, then hashed. The underscore prefix stays:
  // resolveAuth and secret scanners key off `agt_`.
  return `agt_${randomSecret()}`;
}

// BetterAuth-style opaque user id for JIT-provisioned agent users. We insert
// these directly (bypassing BetterAuth's sign-up), so any unique string works.
export function newUserId(): string {
  return `usr_${randomId()}`;
}

// Lowercase suffix for human-readable slugs, e.g. "acme-x3k9f2qa".
export function newSlugSuffix(): string {
  return randomSlug();
}
