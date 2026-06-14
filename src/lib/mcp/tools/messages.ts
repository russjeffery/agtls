import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduledMessage } from "@/lib/db/schema";
import { newId } from "@/lib/api/ids";
import { serializeScheduledMessage } from "@/lib/api/serialize";
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

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function messageTools(server: McpServer): void {
  // ── messages_read ─────────────────────────────────────────────────────────────
  server.tool(
    "messages_read",
    "Read scheduled messages. Pass an `id` to fetch a single message (with its " +
      "delivery status), or omit it to list messages. Anonymous callers can't list, " +
      "but can fetch a public message by ID.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().optional().describe("Message ID — when set, returns that single message."),
      limit: z.number().int().min(1).max(100).optional().describe("List size (1–100, default 20)."),
      after: z.string().optional().describe("List cursor: ID of the last message from the previous page."),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      if (args.id) {
        const [row] = await db
          .select()
          .from(scheduledMessage)
          .where(eq(scheduledMessage.id, args.id))
          .limit(1);
        if (!row) return mcpError(`No scheduled message with ID '${args.id}' exists.`);
        if (!canAccess(row.organizationId, auth?.organizationId)) {
          return mcpError("You do not have access to this resource.");
        }
        return mcpOk(serializeScheduledMessage(row));
      }

      if (!auth) {
        return mcpOk({ object: "list", data: [], has_more: false, next_cursor: null });
      }

      return mcpOk(
        await paginatedList({
          table: scheduledMessage,
          timeColumn: scheduledMessage.createdAt,
          idColumn: scheduledMessage.id,
          where: eq(scheduledMessage.organizationId, auth.organizationId),
          serialize: serializeScheduledMessage,
          limit: clampLimit(args.limit),
          after: args.after,
        })
      );
    }
  );

  // ── messages_write ────────────────────────────────────────────────────────────
  server.tool(
    "messages_write",
    "Schedule or cancel a message. `schedule` fires an HTTP request at a URL at a " +
      "future time — provide either `scheduled_at` (absolute Unix seconds) or " +
      "`delay_seconds` (relative to now). `cancel` deletes a scheduled message " +
      "(requires `id`); if it hasn't fired yet, it never will.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      action: z.enum(["schedule", "cancel"]).describe("The operation to perform."),
      id: z.string().optional().describe("Message ID (required for cancel)."),
      url: z.string().min(1).max(2000).optional().describe("Target URL (http/https) to send the request to (required for schedule)."),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().describe("HTTP method (default POST)."),
      headers: z.record(z.string(), z.string()).optional().describe("Optional request headers."),
      body: z.string().max(1_000_000).optional().describe("Optional request body (sent for non-GET methods)."),
      scheduled_at: z.number().int().optional().describe("Absolute fire time, Unix seconds."),
      delay_seconds: z.number().int().min(0).optional().describe("Fire this many seconds from now."),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      // ── cancel ──
      if (args.action === "cancel") {
        if (!args.id) return mcpError("`id` is required to cancel a message.");

        const [row] = await db
          .select()
          .from(scheduledMessage)
          .where(eq(scheduledMessage.id, args.id))
          .limit(1);
        if (!row) return mcpError(`No scheduled message with ID '${args.id}' exists.`);
        if (!canAccess(row.organizationId, auth?.organizationId)) {
          return mcpError("You do not have access to this resource.");
        }

        await db.delete(scheduledMessage).where(eq(scheduledMessage.id, args.id));
        return mcpOk({ id: args.id, object: "scheduled_message", canceled: true });
      }

      // ── schedule ──
      if (!args.url) return mcpError("`url` is required to schedule a message.");
      if (!isHttpUrl(args.url)) return mcpError("url must be an http or https URL.");
      if (args.scheduled_at === undefined && args.delay_seconds === undefined) {
        return mcpError("Provide either scheduled_at (Unix seconds) or delay_seconds.");
      }

      const now = new Date();
      const scheduledAt =
        args.scheduled_at !== undefined
          ? new Date(args.scheduled_at * 1000)
          : new Date(now.getTime() + (args.delay_seconds ?? 0) * 1000);

      const claim = auth ? null : mintResourceClaimToken();
      const [row] = await db
        .insert(scheduledMessage)
        .values({
          id: newId("scheduledMessage"),
          organizationId: auth ? auth.organizationId : null,
          channel: "http",
          url: args.url,
          method: args.method ?? "POST",
          headers: args.headers ?? null,
          body: args.body ?? null,
          scheduledAt,
          status: "scheduled",
          claimTokenHash: claim?.hash ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return mcpOk(
        claim
          ? { ...serializeScheduledMessage(row), claim_token: claim.token }
          : serializeScheduledMessage(row)
      );
    }
  );
}
