import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq, and, isNull, desc, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { task, taskList } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { serializeTask, serializeTaskList } from "@/lib/api/serialize";
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
  resourceProjectId: string | null,
  authProjectId: string | null | undefined
): boolean {
  if (resourceProjectId === null) return true;
  return resourceProjectId === authProjectId;
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
    "List tasks. Supports filtering by status, priority, assignee, and list_id.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      status: z
        .enum(["todo", "in_progress", "done", "cancelled"])
        .optional()
        .describe("Filter by task status"),
      priority: z
        .enum(["low", "medium", "high", "urgent"])
        .optional()
        .describe("Filter by priority"),
      assignee: z.string().optional().describe("Filter by assignee"),
      list_id: z.string().optional().describe("Filter by task list ID"),
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
      const ownerCondition = auth
        ? eq(task.projectId, auth.projectId)
        : isNull(task.projectId);

      const conditions = [ownerCondition];

      if (args.status) conditions.push(eq(task.status, args.status));
      if (args.priority) conditions.push(eq(task.priority, args.priority));
      if (args.assignee) conditions.push(eq(task.assignee, args.assignee));
      if (args.list_id) conditions.push(eq(task.listId, args.list_id));

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
    "Get a single task by ID.",
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
      if (!canAccess(row.projectId, auth?.projectId)) {
        return mcpError("You do not have access to this resource.");
      }

      return mcpOk(serializeTask(row));
    }
  );

  // ── tasks_create ──────────────────────────────────────────────────────────
  server.tool(
    "tasks_create",
    "Create a new task.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      title: z.string().min(1).max(500).describe("Task title"),
      description: z.string().optional().nullable().describe("Task description"),
      list_id: z.string().optional().nullable().describe("Task list ID to add this task to"),
      status: z
        .enum(["todo", "in_progress", "done", "cancelled"])
        .optional()
        .describe("Task status (default: todo)"),
      priority: z
        .enum(["low", "medium", "high", "urgent"])
        .optional()
        .describe("Task priority (default: medium)"),
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

      // Validate list if provided
      if (args.list_id) {
        const [listRow] = await db
          .select()
          .from(taskList)
          .where(eq(taskList.id, args.list_id))
          .limit(1);

        if (!listRow) return mcpError(`No task list with ID '${args.list_id}' exists.`);
        if (!canAccess(listRow.projectId, auth?.projectId)) {
          return mcpError("You do not have access to this task list.");
        }
      }

      const id = newId("task");
      const now = new Date();

      const [row] = await db
        .insert(task)
        .values({
          id,
          projectId: auth ? auth.projectId : null,
          listId: args.list_id ?? null,
          title: args.title,
          description: args.description ?? null,
          status: args.status ?? "todo",
          priority: args.priority ?? "medium",
          assignee: args.assignee ?? null,
          metadata: args.metadata ?? {},
          dueAt: args.due_at != null ? new Date(args.due_at * 1000) : null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return mcpOk(serializeTask(row));
    }
  );

  // ── tasks_update ──────────────────────────────────────────────────────────
  server.tool(
    "tasks_update",
    "Update a task (partial update).",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Task ID"),
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
      list_id: z.string().nullable().optional().describe("Move to a different task list"),
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
      if (!canAccess(row.projectId, auth?.projectId)) {
        return mcpError("You do not have access to this resource.");
      }

      const now = new Date();
      const updates: Partial<typeof task.$inferInsert> = { updatedAt: now };

      if (args.title !== undefined) updates.title = args.title;
      if (args.description !== undefined) updates.description = args.description;
      if (args.assignee !== undefined) updates.assignee = args.assignee;
      if (args.metadata !== undefined) updates.metadata = args.metadata;
      if (args.list_id !== undefined) updates.listId = args.list_id;
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
    "Delete a task by ID.",
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
      if (!canAccess(row.projectId, auth?.projectId)) {
        return mcpError("You do not have access to this resource.");
      }

      await db.delete(task).where(eq(task.id, args.id));

      return mcpOk({ id: args.id, object: "task", deleted: true });
    }
  );

  // ── task_lists_list ───────────────────────────────────────────────────────
  server.tool(
    "task_lists_list",
    "List task lists.",
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
      const ownerCondition = auth
        ? eq(taskList.projectId, auth.projectId)
        : isNull(taskList.projectId);

      const conditions = [ownerCondition];

      if (args.after) {
        const [cursorRow] = await db
          .select({ createdAt: taskList.createdAt })
          .from(taskList)
          .where(eq(taskList.id, args.after))
          .limit(1);
        if (cursorRow) conditions.push(lt(taskList.createdAt, cursorRow.createdAt));
      }

      const rows = await db
        .select()
        .from(taskList)
        .where(and(...conditions))
        .orderBy(desc(taskList.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map(serializeTaskList);

      return mcpOk({
        object: "list",
        data,
        has_more: hasMore,
        next_cursor: hasMore ? data[data.length - 1].id : null,
      });
    }
  );

  // ── task_lists_get ────────────────────────────────────────────────────────
  server.tool(
    "task_lists_get",
    "Get a single task list by ID.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Task list ID"),
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
        .from(taskList)
        .where(eq(taskList.id, args.id))
        .limit(1);

      if (!row) return mcpError(`No task list with ID '${args.id}' exists.`);
      if (!canAccess(row.projectId, auth?.projectId)) {
        return mcpError("You do not have access to this resource.");
      }

      return mcpOk(serializeTaskList(row));
    }
  );

  // ── task_lists_create ─────────────────────────────────────────────────────
  server.tool(
    "task_lists_create",
    "Create a new task list.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      name: z.string().min(1).max(200).describe("Task list name"),
      description: z.string().optional().nullable().describe("Task list description"),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      const id = newId("taskList");
      const now = new Date();

      const [row] = await db
        .insert(taskList)
        .values({
          id,
          projectId: auth ? auth.projectId : null,
          name: args.name,
          description: args.description ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return mcpOk(serializeTaskList(row));
    }
  );

  // ── task_lists_update ─────────────────────────────────────────────────────
  server.tool(
    "task_lists_update",
    "Update a task list (partial update).",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Task list ID"),
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
        .from(taskList)
        .where(eq(taskList.id, args.id))
        .limit(1);

      if (!row) return mcpError(`No task list with ID '${args.id}' exists.`);
      if (!canAccess(row.projectId, auth?.projectId)) {
        return mcpError("You do not have access to this resource.");
      }

      const updates: Partial<typeof taskList.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (args.name !== undefined) updates.name = args.name;
      if (args.description !== undefined) updates.description = args.description;

      const [updated] = await db
        .update(taskList)
        .set(updates)
        .where(eq(taskList.id, args.id))
        .returning();

      return mcpOk(serializeTaskList(updated));
    }
  );

  // ── task_lists_delete ─────────────────────────────────────────────────────
  server.tool(
    "task_lists_delete",
    "Delete a task list by ID.",
    {
      api_key: z.string().optional().describe("API key for authentication"),
      id: z.string().describe("Task list ID"),
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
        .from(taskList)
        .where(eq(taskList.id, args.id))
        .limit(1);

      if (!row) return mcpError(`No task list with ID '${args.id}' exists.`);
      if (!canAccess(row.projectId, auth?.projectId)) {
        return mcpError("You do not have access to this resource.");
      }

      await db.delete(taskList).where(eq(taskList.id, args.id));

      return mcpOk({ id: args.id, object: "task_list", deleted: true });
    }
  );
}
