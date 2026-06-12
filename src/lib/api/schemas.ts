import { z } from "zod";

// Shared Zod request schemas — single source of truth for both request
// validation (in the route handlers) and the OpenAPI spec (src/lib/openapi).
// Keeping them here avoids the OpenAPI builder importing from app/ route files.

export const taskPriorityEnum = z.enum(["low", "medium", "high", "critical"]);

export const taskLabelsSchema = z.array(z.string().min(1).max(100)).max(50);

export const taskCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  priority: taskPriorityEnum.optional(),
  due_at: z.number().int().optional().nullable(),
  labels: taskLabelsSchema.optional(),
});

export const taskPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  priority: taskPriorityEnum.optional(),
  due_at: z.number().int().nullable().optional(),
  labels: taskLabelsSchema.nullable().optional(),
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

// ─── Artifacts ────────────────────────────────────────────────────────────────
// `format` decides the content type the raw endpoint serves the artifact with;
// other formats can be added without changing the request shape.

export const artifactFormatEnum = z.enum(["markdown", "html"]);

export const artifactCreateSchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string().max(1_000_000),
  format: artifactFormatEnum.optional(),
});

export const artifactPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  content: z.string().max(1_000_000).optional(),
  format: artifactFormatEnum.optional(),
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
