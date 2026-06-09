import { nanoid } from "nanoid";

const prefixes = {
  project: "prj",
  apiKey: "agt",
  taskList: "tsl",
  task: "tsk",
  webhookEndpoint: "whe",
  webhookEvent: "wev",
} as const;

type Prefix = keyof typeof prefixes;

export function newId(type: Prefix): string {
  return `${prefixes[type]}_${nanoid(24)}`;
}

export function newApiKey(environment: "live" | "test"): string {
  // agt_live_<24 chars> — shown once, then hashed
  return `agt_${environment}_${nanoid(24)}`;
}
