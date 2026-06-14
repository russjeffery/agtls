import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, jsonArrayContains } from "@/lib/db";
import { task } from "@/lib/db/schema";
import { newId } from "@/lib/api/ids";
import { serializeTask } from "@/lib/api/serialize";
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

const priorityEnum = z.enum(["low", "medium", "high", "critical"]);

export function taskTools(server: McpServer): void {
  // ── tasks_read ──────────────────────────────────────────────────────────────
  server.tool(
    "tasks_read",
    "Read tasks. Pass an `id` to fetch a single task, or omit it to list tasks " +
      "(optionally filtered by `label`). Anonymous callers can't list, but can " +
      "fetch a public task by ID.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().optional().describe("Task ID — when set, returns that single task"),
      label: z.string().optional().describe("List filter: only tasks carrying this label"),
      limit: z.number().int().min(1).max(100).optional().describe("List size (1-100, default 20)"),
      after: z.string().optional().describe("List cursor (last item ID from the previous page)"),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      // Single fetch
      if (args.id) {
        const [row] = await db.select().from(task).where(eq(task.id, args.id)).limit(1);
        if (!row) return mcpError(`No task with ID '${args.id}' exists.`);
        if (!canAccess(row.organizationId, auth?.organizationId)) {
          return mcpError("You do not have access to this resource.");
        }
        return mcpOk(serializeTask(row));
      }

      // List — anonymous callers can't enumerate (mirrors GET /api/tasks);
      // public tasks stay reachable by ID above.
      if (!auth) {
        return mcpOk({ object: "list", data: [], has_more: false, next_cursor: null });
      }

      const conditions = [eq(task.organizationId, auth.organizationId)];
      if (args.label) conditions.push(jsonArrayContains(task.labels, [args.label]));

      return mcpOk(
        await paginatedList({
          table: task,
          timeColumn: task.createdAt,
          idColumn: task.id,
          where: and(...conditions),
          serialize: serializeTask,
          limit: clampLimit(args.limit),
          after: args.after,
        })
      );
    }
  );

  // ── tasks_write ─────────────────────────────────────────────────────────────
  server.tool(
    "tasks_write",
    "Create, update, or delete a task. `create` requires `name`; `update` and " +
      "`delete` require `id`.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      action: z.enum(["create", "update", "delete"]).describe("The operation to perform"),
      id: z.string().optional().describe("Task ID (required for update/delete)"),
      name: z.string().min(1).max(200).optional().describe("Task name (required for create)"),
      description: z.string().nullable().optional().describe("Task description"),
      priority: priorityEnum.optional().describe("Task priority (default low on create)"),
      due_at: z
        .number()
        .int()
        .nullable()
        .optional()
        .describe("Due date as Unix timestamp, or null to clear"),
      labels: z
        .array(z.string().min(1).max(100))
        .max(50)
        .nullable()
        .optional()
        .describe("Labels for grouping/filtering (replaces the existing set), or null to clear"),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      // ── create ──
      if (args.action === "create") {
        if (!args.name) return mcpError("`name` is required to create a task.");

        const now = new Date();
        const claim = auth ? null : mintResourceClaimToken();
        const [row] = await db
          .insert(task)
          .values({
            id: newId("task"),
            organizationId: auth ? auth.organizationId : null,
            name: args.name,
            description: args.description ?? null,
            priority: args.priority ?? "low",
            dueAt: args.due_at != null ? new Date(args.due_at * 1000) : null,
            labels: args.labels ?? null,
            claimTokenHash: claim?.hash ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return mcpOk(
          claim ? { ...serializeTask(row), claim_token: claim.token } : serializeTask(row)
        );
      }

      // update / delete both need an existing, accessible row
      if (!args.id) return mcpError(`\`id\` is required to ${args.action} a task.`);

      const [row] = await db.select().from(task).where(eq(task.id, args.id)).limit(1);
      if (!row) return mcpError(`No task with ID '${args.id}' exists.`);
      if (!canAccess(row.organizationId, auth?.organizationId)) {
        return mcpError("You do not have access to this resource.");
      }

      // ── delete ──
      if (args.action === "delete") {
        await db.delete(task).where(eq(task.id, args.id));
        return mcpOk({ id: args.id, object: "task", deleted: true });
      }

      // ── update ──
      const updates: Partial<typeof task.$inferInsert> = { updatedAt: new Date() };
      if (args.name !== undefined) updates.name = args.name;
      if (args.description !== undefined) updates.description = args.description;
      if (args.priority !== undefined) updates.priority = args.priority;
      if (args.due_at !== undefined) {
        updates.dueAt = args.due_at != null ? new Date(args.due_at * 1000) : null;
      }
      if (args.labels !== undefined) updates.labels = args.labels;

      const [updated] = await db
        .update(task)
        .set(updates)
        .where(eq(task.id, args.id))
        .returning();

      return mcpOk(serializeTask(updated));
    }
  );
}
