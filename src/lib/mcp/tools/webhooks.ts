import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq, desc, lt, and, isNull, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookEndpoint, webhookEvent } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import {
  serializeWebhookEndpoint,
  serializeWebhookEvent,
} from "@/lib/api/serialize";

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuth(apiKey?: string) {
  if (!apiKey) return null;
  const fakeRequest = new Request("https://localhost/", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return resolveAuth(fakeRequest);
}

// ─── Ownership check ─────────────────────────────────────────────────────────

function canAccess(
  endpoint: typeof webhookEndpoint.$inferSelect,
  auth: { projectId: string } | null
): boolean {
  if (endpoint.projectId === null) return true;
  if (!auth) return false;
  return auth.projectId === endpoint.projectId;
}

// ─── Shared error text ────────────────────────────────────────────────────────

function errorText(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

// ─── Tool registrations ───────────────────────────────────────────────────────

export function webhookTools(server: McpServer): void {
  // ── webhook_endpoints_list ──────────────────────────────────────────────────
  server.tool(
    "webhook_endpoints_list",
    "List webhook endpoints. Returns endpoints owned by the authenticated project, or public endpoints if no API key is provided.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of results (1–100, default 20)."),
      after: z.string().optional().describe("Cursor: ID of the last endpoint from the previous page."),
    },
    async ({ api_key, limit = 20, after }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const ownershipCondition = auth
        ? eq(webhookEndpoint.projectId, auth.projectId)
        : isNull(webhookEndpoint.projectId);

      let cursorCondition;
      if (after) {
        const cursor = await db
          .select({ createdAt: webhookEndpoint.createdAt })
          .from(webhookEndpoint)
          .where(eq(webhookEndpoint.id, after))
          .limit(1);
        if (cursor.length > 0) {
          cursorCondition = lt(webhookEndpoint.createdAt, cursor[0].createdAt);
        }
      }

      const conditions = cursorCondition
        ? and(ownershipCondition, cursorCondition)
        : ownershipCondition;

      const rows = await db
        .select()
        .from(webhookEndpoint)
        .where(conditions)
        .orderBy(desc(webhookEndpoint.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map((r) => serializeWebhookEndpoint(r));

      const result = {
        object: "list",
        data,
        has_more: hasMore,
        next_cursor: hasMore ? data[data.length - 1].id : null,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── webhook_endpoints_get ───────────────────────────────────────────────────
  server.tool(
    "webhook_endpoints_get",
    "Get a single webhook endpoint by ID, including the count of stored events.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().describe("The webhook endpoint ID (e.g. wh_...)."),
    },
    async ({ api_key, id }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const rows = await db
        .select()
        .from(webhookEndpoint)
        .where(eq(webhookEndpoint.id, id))
        .limit(1);

      if (rows.length === 0) {
        return errorText(`No webhook endpoint with ID '${id}' exists.`);
      }

      const endpoint = rows[0];

      if (!canAccess(endpoint, auth)) {
        return errorText("You do not have access to this resource.");
      }

      const [{ value: eventCount }] = await db
        .select({ value: count() })
        .from(webhookEvent)
        .where(eq(webhookEvent.endpointId, id));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(serializeWebhookEndpoint(endpoint, eventCount), null, 2),
          },
        ],
      };
    }
  );

  // ── webhook_endpoints_create ────────────────────────────────────────────────
  server.tool(
    "webhook_endpoints_create",
    "Create a new webhook endpoint. Returns the endpoint object including the catch URL that agents or services should POST to.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      name: z.string().min(1).max(200).describe("Name for the endpoint."),
      description: z.string().max(1000).optional().describe("Optional description."),
      max_events: z.number().int().min(1).max(10000).optional().describe("Maximum events to retain (default 100)."),
    },
    async ({ api_key, name, description, max_events }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const id = newId("webhookEndpoint");
      const now = new Date();

      const [row] = await db
        .insert(webhookEndpoint)
        .values({
          id,
          projectId: auth ? auth.projectId : null,
          name,
          description: description ?? null,
          maxEvents: max_events ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(serializeWebhookEndpoint(row), null, 2),
          },
        ],
      };
    }
  );

  // ── webhook_endpoints_update ────────────────────────────────────────────────
  server.tool(
    "webhook_endpoints_update",
    "Update a webhook endpoint's name or description.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().describe("The webhook endpoint ID."),
      name: z.string().min(1).max(200).optional().describe("New name."),
      description: z.string().max(1000).optional().nullable().describe("New description (null to clear)."),
      max_events: z.number().int().min(1).max(10000).optional().nullable().describe("New max events limit (null to reset to default)."),
    },
    async ({ api_key, id, name, description, max_events }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const rows = await db
        .select()
        .from(webhookEndpoint)
        .where(eq(webhookEndpoint.id, id))
        .limit(1);

      if (rows.length === 0) {
        return errorText(`No webhook endpoint with ID '${id}' exists.`);
      }

      if (!canAccess(rows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      const updates: Partial<typeof webhookEndpoint.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description ?? null;
      if (max_events !== undefined) updates.maxEvents = max_events ?? null;

      const [updated] = await db
        .update(webhookEndpoint)
        .set(updates)
        .where(eq(webhookEndpoint.id, id))
        .returning();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(serializeWebhookEndpoint(updated), null, 2),
          },
        ],
      };
    }
  );

  // ── webhook_endpoints_delete ────────────────────────────────────────────────
  server.tool(
    "webhook_endpoints_delete",
    "Delete a webhook endpoint and all its captured events.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().describe("The webhook endpoint ID to delete."),
    },
    async ({ api_key, id }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const rows = await db
        .select()
        .from(webhookEndpoint)
        .where(eq(webhookEndpoint.id, id))
        .limit(1);

      if (rows.length === 0) {
        return errorText(`No webhook endpoint with ID '${id}' exists.`);
      }

      if (!canAccess(rows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      await db.delete(webhookEvent).where(eq(webhookEvent.endpointId, id));
      await db.delete(webhookEndpoint).where(eq(webhookEndpoint.id, id));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ deleted: true, id }, null, 2),
          },
        ],
      };
    }
  );

  // ── webhook_events_list ─────────────────────────────────────────────────────
  server.tool(
    "webhook_events_list",
    "List captured webhook events for an endpoint, most recent first.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      endpoint_id: z.string().describe("The webhook endpoint ID."),
      limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of results (1–100, default 20)."),
      after: z.string().optional().describe("Cursor: ID of the last event from the previous page."),
    },
    async ({ api_key, endpoint_id, limit = 20, after }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const endpointRows = await db
        .select()
        .from(webhookEndpoint)
        .where(eq(webhookEndpoint.id, endpoint_id))
        .limit(1);

      if (endpointRows.length === 0) {
        return errorText(`No webhook endpoint with ID '${endpoint_id}' exists.`);
      }

      if (!canAccess(endpointRows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      let cursorCondition;
      if (after) {
        const cursor = await db
          .select({ receivedAt: webhookEvent.receivedAt })
          .from(webhookEvent)
          .where(eq(webhookEvent.id, after))
          .limit(1);
        if (cursor.length > 0) {
          cursorCondition = lt(webhookEvent.receivedAt, cursor[0].receivedAt);
        }
      }

      const baseCondition = eq(webhookEvent.endpointId, endpoint_id);
      const conditions = cursorCondition
        ? and(baseCondition, cursorCondition)
        : baseCondition;

      const rows = await db
        .select()
        .from(webhookEvent)
        .where(conditions)
        .orderBy(desc(webhookEvent.receivedAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map(serializeWebhookEvent);

      const result = {
        object: "list",
        data,
        has_more: hasMore,
        next_cursor: hasMore ? data[data.length - 1].id : null,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── webhook_events_get ──────────────────────────────────────────────────────
  server.tool(
    "webhook_events_get",
    "Get a single captured webhook event by ID.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      endpoint_id: z.string().describe("The webhook endpoint ID."),
      event_id: z.string().describe("The webhook event ID (e.g. whe_...)."),
    },
    async ({ api_key, endpoint_id, event_id }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const endpointRows = await db
        .select()
        .from(webhookEndpoint)
        .where(eq(webhookEndpoint.id, endpoint_id))
        .limit(1);

      if (endpointRows.length === 0) {
        return errorText(`No webhook endpoint with ID '${endpoint_id}' exists.`);
      }

      if (!canAccess(endpointRows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      const rows = await db
        .select()
        .from(webhookEvent)
        .where(
          and(
            eq(webhookEvent.id, event_id),
            eq(webhookEvent.endpointId, endpoint_id)
          )
        )
        .limit(1);

      if (rows.length === 0) {
        return errorText(`No webhook event with ID '${event_id}' exists.`);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(serializeWebhookEvent(rows[0]), null, 2),
          },
        ],
      };
    }
  );

  // ── webhook_events_delete ───────────────────────────────────────────────────
  server.tool(
    "webhook_events_delete",
    "Delete a single captured webhook event.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      endpoint_id: z.string().describe("The webhook endpoint ID."),
      event_id: z.string().describe("The webhook event ID to delete."),
    },
    async ({ api_key, endpoint_id, event_id }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const endpointRows = await db
        .select()
        .from(webhookEndpoint)
        .where(eq(webhookEndpoint.id, endpoint_id))
        .limit(1);

      if (endpointRows.length === 0) {
        return errorText(`No webhook endpoint with ID '${endpoint_id}' exists.`);
      }

      if (!canAccess(endpointRows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      const rows = await db
        .select({ id: webhookEvent.id })
        .from(webhookEvent)
        .where(
          and(
            eq(webhookEvent.id, event_id),
            eq(webhookEvent.endpointId, endpoint_id)
          )
        )
        .limit(1);

      if (rows.length === 0) {
        return errorText(`No webhook event with ID '${event_id}' exists.`);
      }

      await db.delete(webhookEvent).where(eq(webhookEvent.id, event_id));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ deleted: true, id: event_id }, null, 2),
          },
        ],
      };
    }
  );

  // ── webhook_events_clear ────────────────────────────────────────────────────
  server.tool(
    "webhook_events_clear",
    "Delete all captured webhook events for an endpoint.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      endpoint_id: z.string().describe("The webhook endpoint ID whose events to clear."),
    },
    async ({ api_key, endpoint_id }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const endpointRows = await db
        .select()
        .from(webhookEndpoint)
        .where(eq(webhookEndpoint.id, endpoint_id))
        .limit(1);

      if (endpointRows.length === 0) {
        return errorText(`No webhook endpoint with ID '${endpoint_id}' exists.`);
      }

      if (!canAccess(endpointRows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      const [{ value: deletedCount }] = await db
        .select({ value: count() })
        .from(webhookEvent)
        .where(eq(webhookEvent.endpointId, endpoint_id));

      await db.delete(webhookEvent).where(eq(webhookEvent.endpointId, endpoint_id));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { cleared: true, endpoint_id, events_deleted: deletedCount },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
