import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, jsonArrayContains } from "@/lib/db";
import { beforeCursor } from "@/lib/api/cursor";
import { task } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { serializeTask } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
import type { AuthContext } from "@/lib/api/middleware";

// ─── Auth helper ─────────────────────────────────────────────────────────────

/**
 * Resolve auth from either an explicit api_key param or the MCP extra.authInfo.token.
 * Returns null for unauthenticated access. Throws with message if key is invalid.
 */
async function getAuth(
  apiKey: string | undefined | null,
  extra: { authInfo?: { token?: string } }
): Promise<AuthContext | null> {
  const token = apiKey ?? extra.authInfo?.token;
  if (!token) return null;

  const fakeRequest = new Request("https://internal/mcp", {
    headers: { authorization: `Bearer ${token}` },
  });
  return resolveAuth(fakeRequest);
}

// ─── MCP error helper ─────────────────────────────────────────────────────────

function mcpError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

function mcpOk(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

// ─── Ownership check helpers ──────────────────────────────────────────────────

function canAccess(
  resourceOrganizationId: string | null,
  authOrganizationId: string | null | undefined
): boolean {
  if (resourceOrganizationId === null) return true;
  return resourceOrganizationId === authOrganizationId;
}

// ─── Cursor pagination helper ─────────────────────────────────────────────────

function clampLimit(raw: number | undefined | null, defaultVal = 20): number {
  if (!raw || isNaN(raw)) return defaultVal;
  return Math.min(Math.max(1, raw), 100);
}

const priorityEnum = z.enum(["low", "medium", "high", "critical"]);

// ─── Registration ─────────────────────────────────────────────────────────────

export function taskTools(server: McpServer): void {
  // ── tasks_list ────────────────────────────────────────────────────────────
  server.tool(
    "tasks_list",
    "List tasks. Filter by label to get a flexible grouping of related tasks.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      label: z
        .string()
        .optional()
        .describe("Only return tasks carrying this label"),
      limit: z.number().int().min(1).max(100).optional().describe("Number of results (1-100, default 20)"),
      after: z.string().optional().describe("Cursor for pagination (last item ID)"),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      const limit = clampLimit(args.limit);
      // Anonymous callers can't enumerate tasks (mirrors GET /api/tasks);
      // public tasks stay reachable by ID via tasks_get.
      if (!auth) {
        return mcpOk({ object: "list", data: [], has_more: false, next_cursor: null });
      }
      const ownerCondition = eq(task.organizationId, auth.organizationId);

      const conditions = [ownerCondition];

      if (args.label) {
        conditions.push(jsonArrayContains(task.labels, [args.label]));
      }

      if (args.after) {
        const [cursorRow] = await db
          .select({ createdAt: task.createdAt })
          .from(task)
          .where(eq(task.id, args.after))
          .limit(1);
        if (cursorRow)
          conditions.push(
            beforeCursor(task.createdAt, task.id, cursorRow.createdAt, args.after)
          );
      }

      const rows = await db
        .select()
        .from(task)
        .where(and(...conditions))
        .orderBy(desc(task.createdAt), desc(task.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map(serializeTask);

      return mcpOk({
        object: "list",
        data,
        has_more: hasMore,
        next_cursor: hasMore ? data[data.length - 1].id : null,
      });
    }
  );

  // ── tasks_get ─────────────────────────────────────────────────────────────
  server.tool(
    "tasks_get",
    "Get a task by ID (tsk_...).",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Task ID"),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      const [row] = await db
        .select()
        .from(task)
        .where(eq(task.id, args.id))
        .limit(1);

      if (!row) return mcpError(`No task with ID '${args.id}' exists.`);
      if (!canAccess(row.organizationId, auth?.organizationId)) {
        return mcpError("You do not have access to this resource.");
      }

      return mcpOk(serializeTask(row));
    }
  );

  // ── tasks_create ──────────────────────────────────────────────────────────
  server.tool(
    "tasks_create",
    "Create a new task with an optional priority, due date, and labels.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      name: z.string().min(1).max(200).describe("Task name"),
      description: z.string().optional().nullable().describe("Task description"),
      priority: priorityEnum
        .optional()
        .describe("Task priority (default: low)"),
      due_at: z
        .number()
        .int()
        .optional()
        .nullable()
        .describe("Due date as Unix timestamp"),
      labels: z
        .array(z.string().min(1).max(100))
        .max(50)
        .optional()
        .describe("Labels for grouping and filtering"),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      const id = newId("task");
      const now = new Date();

      // Public creation gets a claim token usable later via the claim tool.
      const claim = auth ? null : mintResourceClaimToken();

      const [row] = await db
        .insert(task)
        .values({
          id,
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
        claim
          ? { ...serializeTask(row), claim_token: claim.token }
          : serializeTask(row)
      );
    }
  );

  // ── tasks_update ──────────────────────────────────────────────────────────
  server.tool(
    "tasks_update",
    "Update a task's name, description, priority, due date, or labels.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Task ID"),
      name: z.string().min(1).max(200).optional().describe("New name"),
      description: z.string().nullable().optional().describe("New description"),
      priority: priorityEnum.optional().describe("New priority"),
      due_at: z
        .number()
        .int()
        .nullable()
        .optional()
        .describe("New due date (Unix timestamp), or null to clear"),
      labels: z
        .array(z.string().min(1).max(100))
        .max(50)
        .nullable()
        .optional()
        .describe("New labels (replaces the existing set), or null to clear"),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      const [row] = await db
        .select()
        .from(task)
        .where(eq(task.id, args.id))
        .limit(1);

      if (!row) return mcpError(`No task with ID '${args.id}' exists.`);
      if (!canAccess(row.organizationId, auth?.organizationId)) {
        return mcpError("You do not have access to this resource.");
      }

      const updates: Partial<typeof task.$inferInsert> = {
        updatedAt: new Date(),
      };
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

  // ── tasks_delete ──────────────────────────────────────────────────────────
  server.tool(
    "tasks_delete",
    "Delete a task permanently.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Task ID"),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      const [row] = await db
        .select()
        .from(task)
        .where(eq(task.id, args.id))
        .limit(1);

      if (!row) return mcpError(`No task with ID '${args.id}' exists.`);
      if (!canAccess(row.organizationId, auth?.organizationId)) {
        return mcpError("You do not have access to this resource.");
      }

      await db.delete(task).where(eq(task.id, args.id));

      return mcpOk({ id: args.id, object: "task", deleted: true });
    }
  );
}
