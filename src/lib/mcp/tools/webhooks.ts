import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq, and, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEndpoint, webhookEvent } from "@/lib/db/schema";
import { newId } from "@/lib/api/ids";
import {
  serializeWebhookEndpoint,
  serializeWebhookEvent,
} from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
import type { AuthContext } from "@/lib/api/middleware";
import {
  getAuth,
  mcpError,
  mcpOk,
  canAccess,
  clampLimit,
  paginatedList,
} from "./shared";

// Loads an endpoint and checks access in one step. Returns either the row or an
// mcpError envelope to return directly.
async function loadEndpoint(
  id: string,
  auth: AuthContext | null
): Promise<
  | { ok: true; endpoint: typeof webhookEndpoint.$inferSelect }
  | { ok: false; error: ReturnType<typeof mcpError> }
> {
  const [endpoint] = await db
    .select()
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.id, id))
    .limit(1);
  if (!endpoint) {
    return { ok: false, error: mcpError(`No webhook endpoint with ID '${id}' exists.`) };
  }
  if (!canAccess(endpoint.organizationId, auth?.organizationId)) {
    return { ok: false, error: mcpError("You do not have access to this resource.") };
  }
  return { ok: true, endpoint };
}

export function webhookTools(server: McpServer): void {
  // ── webhooks_read ─────────────────────────────────────────────────────────────
  server.tool(
    "webhooks_read",
    "Read webhook endpoints and their captured events. With no `id`, lists your " +
      "endpoints. With `id`, returns that endpoint (including its event count). " +
      "With `id` + `event_id`, returns that single captured event. With `id` + " +
      "`include_events: true`, returns the endpoint plus a page of its most recent " +
      "events (honors `limit`/`after`).",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().optional().describe("Endpoint ID (e.g. wh_...). Omit to list endpoints."),
      event_id: z.string().optional().describe("Event ID (e.g. whe_...) to fetch a single captured event from the endpoint."),
      include_events: z.boolean().optional().describe("When fetching an endpoint, also return a page of its recent events."),
      limit: z.number().int().min(1).max(100).optional().describe("List size (1–100, default 20) for endpoint lists and event pages."),
      after: z.string().optional().describe("List cursor: ID of the last item from the previous page."),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      // ── single endpoint (and optionally its events) ──
      if (args.id) {
        const loaded = await loadEndpoint(args.id, auth);
        if (!loaded.ok) return loaded.error;

        // Single event under this endpoint
        if (args.event_id) {
          const [event] = await db
            .select()
            .from(webhookEvent)
            .where(
              and(
                eq(webhookEvent.id, args.event_id),
                eq(webhookEvent.endpointId, args.id)
              )
            )
            .limit(1);
          if (!event) return mcpError(`No webhook event with ID '${args.event_id}' exists.`);
          return mcpOk(serializeWebhookEvent(event));
        }

        const [{ value: eventCount }] = await db
          .select({ value: count() })
          .from(webhookEvent)
          .where(eq(webhookEvent.endpointId, args.id));

        const endpointData = serializeWebhookEndpoint(loaded.endpoint, eventCount);

        // Fold in a page of events when requested (replaces webhook_events_list).
        if (args.include_events) {
          const events = await paginatedList({
            table: webhookEvent,
            timeColumn: webhookEvent.receivedAt,
            idColumn: webhookEvent.id,
            where: eq(webhookEvent.endpointId, args.id),
            serialize: serializeWebhookEvent,
            limit: clampLimit(args.limit),
            after: args.after,
          });
          return mcpOk({ ...endpointData, events });
        }

        return mcpOk(endpointData);
      }

      // ── list endpoints ──
      // Anonymous callers can't enumerate (mirrors GET /api/webhooks);
      // public endpoints stay reachable by ID above.
      if (!auth) {
        return mcpOk({ object: "list", data: [], has_more: false, next_cursor: null });
      }

      return mcpOk(
        await paginatedList({
          table: webhookEndpoint,
          timeColumn: webhookEndpoint.createdAt,
          idColumn: webhookEndpoint.id,
          where: eq(webhookEndpoint.organizationId, auth.organizationId),
          serialize: (r: typeof webhookEndpoint.$inferSelect) => serializeWebhookEndpoint(r),
          limit: clampLimit(args.limit),
          after: args.after,
        })
      );
    }
  );

  // ── webhooks_write ────────────────────────────────────────────────────────────
  server.tool(
    "webhooks_write",
    "Manage webhook endpoints and their captured events. Actions: `create` " +
      "(requires `name`) returns the endpoint including the catch URL to POST to; " +
      "`update`/`delete` act on an endpoint (`id`); `delete_event` removes one " +
      "captured event (`id` + `event_id`); `clear_events` removes all events for an " +
      "endpoint (`id`).",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      action: z
        .enum(["create", "update", "delete", "delete_event", "clear_events"])
        .describe("The operation to perform."),
      id: z.string().optional().describe("Endpoint ID (required for everything except create)."),
      event_id: z.string().optional().describe("Event ID (required for delete_event)."),
      name: z.string().min(1).max(200).optional().describe("Endpoint name (required for create)."),
      description: z.string().max(1000).nullable().optional().describe("Endpoint description (null to clear)."),
      max_events: z.number().int().min(1).max(10000).nullable().optional().describe("Max events to retain (default 100; null to reset)."),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      // ── create endpoint ──
      if (args.action === "create") {
        if (!args.name) return mcpError("`name` is required to create a webhook endpoint.");

        const now = new Date();
        const claim = auth ? null : mintResourceClaimToken();
        const [row] = await db
          .insert(webhookEndpoint)
          .values({
            id: newId("webhookEndpoint"),
            organizationId: auth ? auth.organizationId : null,
            name: args.name,
            description: args.description ?? null,
            maxEvents: args.max_events ?? null,
            claimTokenHash: claim?.hash ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return mcpOk(
          claim
            ? { ...serializeWebhookEndpoint(row), claim_token: claim.token }
            : serializeWebhookEndpoint(row)
        );
      }

      // Everything else requires an existing, accessible endpoint.
      if (!args.id) return mcpError(`\`id\` is required to ${args.action}.`);
      const loaded = await loadEndpoint(args.id, auth);
      if (!loaded.ok) return loaded.error;

      // ── delete endpoint ──
      if (args.action === "delete") {
        await db.delete(webhookEvent).where(eq(webhookEvent.endpointId, args.id));
        await db.delete(webhookEndpoint).where(eq(webhookEndpoint.id, args.id));
        return mcpOk({ id: args.id, object: "webhook_endpoint", deleted: true });
      }

      // ── clear all events ──
      if (args.action === "clear_events") {
        const [{ value: deletedCount }] = await db
          .select({ value: count() })
          .from(webhookEvent)
          .where(eq(webhookEvent.endpointId, args.id));
        await db.delete(webhookEvent).where(eq(webhookEvent.endpointId, args.id));
        return mcpOk({ cleared: true, endpoint_id: args.id, events_deleted: deletedCount });
      }

      // ── delete a single event ──
      if (args.action === "delete_event") {
        if (!args.event_id) return mcpError("`event_id` is required to delete_event.");
        const [event] = await db
          .select({ id: webhookEvent.id })
          .from(webhookEvent)
          .where(
            and(
              eq(webhookEvent.id, args.event_id),
              eq(webhookEvent.endpointId, args.id)
            )
          )
          .limit(1);
        if (!event) return mcpError(`No webhook event with ID '${args.event_id}' exists.`);
        await db.delete(webhookEvent).where(eq(webhookEvent.id, args.event_id));
        return mcpOk({ id: args.event_id, object: "webhook_event", deleted: true });
      }

      // ── update endpoint ──
      const updates: Partial<typeof webhookEndpoint.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (args.name !== undefined) updates.name = args.name;
      if (args.description !== undefined) updates.description = args.description ?? null;
      if (args.max_events !== undefined) updates.maxEvents = args.max_events ?? null;

      const [updated] = await db
        .update(webhookEndpoint)
        .set(updates)
        .where(eq(webhookEndpoint.id, args.id))
        .returning();

      return mcpOk(serializeWebhookEndpoint(updated));
    }
  );
}
