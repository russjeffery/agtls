import { nanoid } from "nanoid";

const prefixes = {
  organization: "org",
  member: "mem",
  invitation: "inv",
  apiKey: "agt",
  task: "tsk",
  webhookEndpoint: "wh",
  webhookEvent: "whe",
  artifact: "art",
  scheduledMessage: "msg",
  agentRegistration: "reg",
  agentAuditEvent: "evt",
  claimAttempt: "cla",
} as const;

type Prefix = keyof typeof prefixes;

export function newId(type: Prefix): string {
  return `${prefixes[type]}_${nanoid(24)}`;
}

export function newApiKey(): string {
  // agt_<24 chars> — shown once, then hashed
  return `agt_${nanoid(24)}`;
}

// BetterAuth-style opaque user id for JIT-provisioned agent users. We insert
// these directly (bypassing BetterAuth's sign-up), so any unique string works.
export function newUserId(): string {
  return nanoid(32);
}
