import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq, and, desc, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { task, subtask } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { serializeTask, serializeSubtask } from "@/lib/api/serialize";
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

// ─── Registration ─────────────────────────────────────────────────────────────

export function taskTools(server: McpServer): void {
  // ── tasks_list ────────────────────────────────────────────────────────────
  server.tool(
    "tasks_list",
    "List tasks (containers for subtasks).",
    {
      api_key: z.string().optional().describe("API key for authentication"),
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

      if (args.after) {
        const [cursorRow] = await db
          .select({ createdAt: task.createdAt })
          .from(task)
          .where(eq(task.id, args.after))
          .limit(1);
        if (cursorRow) conditions.push(lt(task.createdAt, cursorRow.createdAt));
      }

      const rows = await db
        .select()
        .from(task)
        .where(and(...conditions))
        .orderBy(desc(task.createdAt))
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
    "Create a new task. A task is a container for subtasks.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      name: z.string().min(1).max(200).describe("Task name"),
      description: z.string().optional().nullable().describe("Task description"),
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
    "Update a task's name or description.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Task ID"),
      name: z.string().min(1).max(200).optional().describe("New name"),
      description: z.string().nullable().optional().describe("New description"),
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
    "Delete a task and all its subtasks.",
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

  // ── subtasks_list ─────────────────────────────────────────────────────────
  server.tool(
    "subtasks_list",
    "List subtasks. Filter by task_id, status, priority, assignee.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      status: z
        .enum(["todo", "in_progress", "done", "cancelled"])
        .optional()
        .describe("Filter by subtask status"),
      priority: z
        .enum(["low", "medium", "high", "urgent"])
        .optional()
        .describe("Filter by priority"),
      assignee: z.string().optional().describe("Filter by assignee"),
      task_id: z.string().optional().describe("Filter by task ID"),
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
      // Anonymous callers can't enumerate subtasks (mirrors GET /api/subtasks);
      // public subtasks stay reachable by ID via subtasks_get.
      if (!auth) {
        return mcpOk({ object: "list", data: [], has_more: false, next_cursor: null });
      }
      const ownerCondition = eq(subtask.organizationId, auth.organizationId);

      const conditions = [ownerCondition];

      if (args.status) conditions.push(eq(subtask.status, args.status));
      if (args.priority) conditions.push(eq(subtask.priority, args.priority));
      if (args.assignee) conditions.push(eq(subtask.assignee, args.assignee));
      if (args.task_id) conditions.push(eq(subtask.taskId, args.task_id));

      if (args.after) {
        const [cursorRow] = await db
          .select({ createdAt: subtask.createdAt })
          .from(subtask)
          .where(eq(subtask.id, args.after))
          .limit(1);
        if (cursorRow) conditions.push(lt(subtask.createdAt, cursorRow.createdAt));
      }

      const rows = await db
        .select()
        .from(subtask)
        .where(and(...conditions))
        .orderBy(desc(subtask.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map(serializeSubtask);

      return mcpOk({
        object: "list",
        data,
        has_more: hasMore,
        next_cursor: hasMore ? data[data.length - 1].id : null,
      });
    }
  );

  // ── subtasks_get ──────────────────────────────────────────────────────────
  server.tool(
    "subtasks_get",
    "Get a subtask by ID (sub_...).",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Subtask ID"),
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
        .from(subtask)
        .where(eq(subtask.id, args.id))
        .limit(1);

      if (!row) return mcpError(`No subtask with ID '${args.id}' exists.`);
      if (!canAccess(row.organizationId, auth?.organizationId)) {
        return mcpError("You do not have access to this resource.");
      }

      return mcpOk(serializeSubtask(row));
    }
  );

  // ── subtasks_create ───────────────────────────────────────────────────────
  server.tool(
    "subtasks_create",
    "Create a subtask. Optionally assign to a task via task_id.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      title: z.string().min(1).max(500).describe("Subtask title"),
      description: z.string().optional().nullable().describe("Subtask description"),
      task_id: z.string().optional().nullable().describe("Task ID to add this subtask to"),
      status: z
        .enum(["todo", "in_progress", "done", "cancelled"])
        .optional()
        .describe("Subtask status (default: todo)"),
      priority: z
        .enum(["low", "medium", "high", "urgent"])
        .optional()
        .describe("Subtask priority (default: medium)"),
      assignee: z.string().optional().nullable().describe("Assignee identifier"),
      metadata: z.record(z.string(), z.unknown()).optional().describe("Arbitrary metadata"),
      due_at: z.number().int().optional().nullable().describe("Due date as Unix timestamp"),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      // Validate task if provided
      if (args.task_id) {
        const [taskRow] = await db
          .select()
          .from(task)
          .where(eq(task.id, args.task_id))
          .limit(1);

        if (!taskRow) return mcpError(`No task with ID '${args.task_id}' exists.`);
        if (!canAccess(taskRow.organizationId, auth?.organizationId)) {
          return mcpError("You do not have access to this task.");
        }
      }

      const id = newId("subtask");
      const now = new Date();

      // Public creation gets a claim token usable later via the claim tool.
      const claim = auth ? null : mintResourceClaimToken();

      const [row] = await db
        .insert(subtask)
        .values({
          id,
          organizationId: auth ? auth.organizationId : null,
          taskId: args.task_id ?? null,
          title: args.title,
          description: args.description ?? null,
          status: args.status ?? "todo",
          priority: args.priority ?? "medium",
          assignee: args.assignee ?? null,
          metadata: args.metadata ?? {},
          dueAt: args.due_at != null ? new Date(args.due_at * 1000) : null,
          completedAt: null,
          claimTokenHash: claim?.hash ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return mcpOk(
        claim
          ? { ...serializeSubtask(row), claim_token: claim.token }
          : serializeSubtask(row)
      );
    }
  );

  // ── subtasks_update ───────────────────────────────────────────────────────
  server.tool(
    "subtasks_update",
    "Update a subtask. Supports status, priority, title, description, assignee, metadata, due_at.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Subtask ID"),
      title: z.string().min(1).max(500).optional().describe("New title"),
      description: z.string().nullable().optional().describe("New description"),
      status: z
        .enum(["todo", "in_progress", "done", "cancelled"])
        .optional()
        .describe("New status"),
      priority: z
        .enum(["low", "medium", "high", "urgent"])
        .optional()
        .describe("New priority"),
      assignee: z.string().nullable().optional().describe("New assignee"),
      metadata: z.record(z.string(), z.unknown()).optional().describe("New metadata"),
      due_at: z.number().int().nullable().optional().describe("New due date (Unix timestamp)"),
      task_id: z.string().nullable().optional().describe("Move to a different task"),
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
        .from(subtask)
        .where(eq(subtask.id, args.id))
        .limit(1);

      if (!row) return mcpError(`No subtask with ID '${args.id}' exists.`);
      if (!canAccess(row.organizationId, auth?.organizationId)) {
        return mcpError("You do not have access to this resource.");
      }

      const now = new Date();
      const updates: Partial<typeof subtask.$inferInsert> = { updatedAt: now };

      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.description = args.description;
      if (args.assignee !== undefined) updates.assignee = args.assignee;
      if (args.metadata !== undefined) updates.metadata = args.metadata;
      if (args.task_id !== undefined) updates.taskId = args.task_id;
      if (args.due_at !== undefined) {
        updates.dueAt = args.due_at != null ? new Date(args.due_at * 1000) : null;
      }
      if (args.priority !== undefined) updates.priority = args.priority;

      if (args.status !== undefined) {
        updates.status = args.status;
        if (args.status === "done" && row.status !== "done") {
          updates.completedAt = now;
        } else if (args.status !== "done" && row.status === "done") {
          updates.completedAt = null;
        }
      }

      const [updated] = await db
        .update(subtask)
        .set(updates)
        .where(eq(subtask.id, args.id))
        .returning();

      return mcpOk(serializeSubtask(updated));
    }
  );

  // ── subtasks_delete ───────────────────────────────────────────────────────
  server.tool(
    "subtasks_delete",
    "Delete a subtask permanently.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Subtask ID"),
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
        .from(subtask)
        .where(eq(subtask.id, args.id))
        .limit(1);

      if (!row) return mcpError(`No subtask with ID '${args.id}' exists.`);
      if (!canAccess(row.organizationId, auth?.organizationId)) {
        return mcpError("You do not have access to this resource.");
      }

      await db.delete(subtask).where(eq(subtask.id, args.id));

      return mcpOk({ id: args.id, object: "subtask", deleted: true });
    }
  );
}
