import { z } from "zod";

// Shared Zod request schemas — single source of truth for both request
// validation (in the route handlers) and the OpenAPI spec (src/lib/openapi).
// Keeping them here avoids the OpenAPI builder importing from app/ route files.

export const taskCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
});

export const taskPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
});

export const subtaskCreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  task_id: z.string().optional().nullable(),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignee: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  due_at: z.number().int().optional().nullable(),
});

export const subtaskPatchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignee: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  due_at: z.number().int().nullable().optional(),
  task_id: z.string().nullable().optional(),
});

export const webhookCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  max_events: z.number().int().min(1).max(10000).optional().nullable(),
});

export const webhookPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  max_events: z.number().int().min(1).max(10000).optional().nullable(),
});

export const claimSchema = z.object({
  claim_token: z.string().min(1),
});

// ─── Memory ───────────────────────────────────────────────────────────────────
// `format` is currently markdown-only but exists so other formats can be added
// later without changing the request shape.

export const memoryFormatEnum = z.enum(["markdown"]);

export const memoryCreateSchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string().max(1_000_000),
  format: memoryFormatEnum.optional(),
});

export const memoryPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  content: z.string().max(1_000_000).optional(),
  format: memoryFormatEnum.optional(),
});

// ─── Scheduled messages ───────────────────────────────────────────────────────
// `channel` is currently http-only but exists so other channels (email, sms, …)
// can be added later. Schedule with exactly one of `scheduled_at` (absolute Unix
// seconds) or `delay_seconds` (relative to now).

export const messageChannelEnum = z.enum(["http"]);
export const messageMethodEnum = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

// Up to one year out, to bound the scheduling window.
const MAX_DELAY_SECONDS = 366 * 24 * 60 * 60;

export const messageCreateSchema = z
  .object({
    channel: messageChannelEnum.optional(),
    url: z.string().min(1).max(2000),
    method: messageMethodEnum.optional(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().max(1_000_000).optional().nullable(),
    scheduled_at: z.number().int().optional(),
    delay_seconds: z.number().int().min(0).max(MAX_DELAY_SECONDS).optional(),
  })
  .refine((v) => v.scheduled_at !== undefined || v.delay_seconds !== undefined, {
    message: "Provide either scheduled_at (Unix seconds) or delay_seconds.",
    path: ["scheduled_at"],
  });

// Only a message that hasn't fired yet can be edited (enforced in the route).
export const messagePatchSchema = z.object({
  url: z.string().min(1).max(2000).optional(),
  method: messageMethodEnum.optional(),
  headers: z.record(z.string(), z.string()).optional().nullable(),
  body: z.string().max(1_000_000).optional().nullable(),
  scheduled_at: z.number().int().optional(),
  delay_seconds: z.number().int().min(0).max(MAX_DELAY_SECONDS).optional(),
});
