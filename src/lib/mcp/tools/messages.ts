import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq, desc, lt, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduledMessage } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { serializeScheduledMessage } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getAuth(apiKey?: string) {
  if (!apiKey) return null;
  const fakeRequest = new Request("https://localhost/", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return resolveAuth(fakeRequest);
}

function canAccess(
  row: typeof scheduledMessage.$inferSelect,
  auth: { organizationId: string } | null
): boolean {
  if (row.organizationId === null) return true;
  if (!auth) return false;
  return auth.organizationId === row.organizationId;
}

function errorText(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function messageTools(server: McpServer): void {
  // ── messages_list ───────────────────────────────────────────────────────────
  server.tool(
    "messages_list",
    "List scheduled messages owned by the authenticated organization, most recently created first. Returns an empty list if no API key is provided.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of results (1–100, default 20)."),
      after: z.string().optional().describe("Cursor: ID of the last message from the previous page."),
    },
    async ({ api_key, limit = 20, after }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      if (!auth) {
        const empty = { object: "list", data: [], has_more: false, next_cursor: null };
        return { content: [{ type: "text" as const, text: JSON.stringify(empty, null, 2) }] };
      }
      const ownershipCondition = eq(scheduledMessage.organizationId, auth.organizationId);

      let cursorCondition;
      if (after) {
        const cursor = await db
          .select({ createdAt: scheduledMessage.createdAt })
          .from(scheduledMessage)
          .where(eq(scheduledMessage.id, after))
          .limit(1);
        if (cursor.length > 0) {
          cursorCondition = lt(scheduledMessage.createdAt, cursor[0].createdAt);
        }
      }

      const conditions = cursorCondition
        ? and(ownershipCondition, cursorCondition)
        : ownershipCondition;

      const rows = await db
        .select()
        .from(scheduledMessage)
        .where(conditions)
        .orderBy(desc(scheduledMessage.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map((r) => serializeScheduledMessage(r));

      const result = {
        object: "list",
        data,
        has_more: hasMore,
        next_cursor: hasMore ? data[data.length - 1].id : null,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── messages_get ────────────────────────────────────────────────────────────
  server.tool(
    "messages_get",
    "Get a single scheduled message by ID, including its delivery status.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().describe("The message ID (e.g. msg_...)."),
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
        .from(scheduledMessage)
        .where(eq(scheduledMessage.id, id))
        .limit(1);
      if (rows.length === 0) {
        return errorText(`No scheduled message with ID '${id}' exists.`);
      }
      if (!canAccess(rows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(serializeScheduledMessage(rows[0]), null, 2) },
        ],
      };
    }
  );

  // ── messages_schedule ───────────────────────────────────────────────────────
  server.tool(
    "messages_schedule",
    "Schedule a message to trigger an agent later by firing an HTTP request to a URL. Provide either scheduled_at (absolute Unix seconds) or delay_seconds (relative to now). Delivery is performed by the dispatcher when the time arrives.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      url: z.string().min(1).max(2000).describe("Target URL (http/https) to send the request to."),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().describe("HTTP method (default POST)."),
      headers: z.record(z.string(), z.string()).optional().describe("Optional request headers."),
      body: z.string().max(1_000_000).optional().describe("Optional request body (sent for non-GET methods)."),
      scheduled_at: z.number().int().optional().describe("Absolute fire time, Unix seconds."),
      delay_seconds: z.number().int().min(0).optional().describe("Fire this many seconds from now."),
    },
    async ({ api_key, url, method, headers, body, scheduled_at, delay_seconds }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      if (!isHttpUrl(url)) {
        return errorText("url must be an http or https URL.");
      }
      if (scheduled_at === undefined && delay_seconds === undefined) {
        return errorText("Provide either scheduled_at (Unix seconds) or delay_seconds.");
      }

      const now = new Date();
      const scheduledAt =
        scheduled_at !== undefined
          ? new Date(scheduled_at * 1000)
          : new Date(now.getTime() + (delay_seconds ?? 0) * 1000);

      const id = newId("scheduledMessage");
      const claim = auth ? null : mintResourceClaimToken();

      const [row] = await db
        .insert(scheduledMessage)
        .values({
          id,
          organizationId: auth ? auth.organizationId : null,
          channel: "http",
          url,
          method: method ?? "POST",
          headers: headers ?? null,
          body: body ?? null,
          scheduledAt,
          status: "scheduled",
          claimTokenHash: claim?.hash ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const data = claim
        ? { ...serializeScheduledMessage(row), claim_token: claim.token }
        : serializeScheduledMessage(row);

      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── messages_cancel ─────────────────────────────────────────────────────────
  server.tool(
    "messages_cancel",
    "Cancel and delete a scheduled message. If it hasn't fired yet, it never will.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().describe("The message ID to cancel."),
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
        .from(scheduledMessage)
        .where(eq(scheduledMessage.id, id))
        .limit(1);
      if (rows.length === 0) {
        return errorText(`No scheduled message with ID '${id}' exists.`);
      }
      if (!canAccess(rows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      await db.delete(scheduledMessage).where(eq(scheduledMessage.id, id));

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ canceled: true, id }, null, 2) }],
      };
    }
  );
}
