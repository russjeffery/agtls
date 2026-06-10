import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq, desc, lt, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { memory } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { serializeMemory } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";

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
  row: typeof memory.$inferSelect,
  auth: { organizationId: string } | null
): boolean {
  if (row.organizationId === null) return true;
  if (!auth) return false;
  return auth.organizationId === row.organizationId;
}

function errorText(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

export function memoryTools(server: McpServer): void {
  // ── memory_list ─────────────────────────────────────────────────────────────
  server.tool(
    "memory_list",
    "List memories. Returns memories owned by the authenticated organization, or an empty list if no API key is provided (public memories stay reachable by ID via memory_get).",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of results (1–100, default 20)."),
      after: z.string().optional().describe("Cursor: ID of the last memory from the previous page."),
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
      const ownershipCondition = eq(memory.organizationId, auth.organizationId);

      let cursorCondition;
      if (after) {
        const cursor = await db
          .select({ createdAt: memory.createdAt })
          .from(memory)
          .where(eq(memory.id, after))
          .limit(1);
        if (cursor.length > 0) {
          cursorCondition = lt(memory.createdAt, cursor[0].createdAt);
        }
      }

      const conditions = cursorCondition
        ? and(ownershipCondition, cursorCondition)
        : ownershipCondition;

      const rows = await db
        .select()
        .from(memory)
        .where(conditions)
        .orderBy(desc(memory.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map((r) => serializeMemory(r));

      const result = {
        object: "list",
        data,
        has_more: hasMore,
        next_cursor: hasMore ? data[data.length - 1].id : null,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── memory_get ──────────────────────────────────────────────────────────────
  server.tool(
    "memory_get",
    "Get a single memory by ID, including its full content.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().describe("The memory ID (e.g. memo_...)."),
    },
    async ({ api_key, id }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const rows = await db.select().from(memory).where(eq(memory.id, id)).limit(1);
      if (rows.length === 0) {
        return errorText(`No memory with ID '${id}' exists.`);
      }
      if (!canAccess(rows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(serializeMemory(rows[0]), null, 2) },
        ],
      };
    }
  );

  // ── memory_create ───────────────────────────────────────────────────────────
  server.tool(
    "memory_create",
    "Create a memory. Stores a file of content for later recall. Only markdown is accepted today (the default format).",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      name: z.string().min(1).max(200).describe("Name/label for the memory."),
      content: z.string().max(1_000_000).describe("The memory content (markdown)."),
      format: z.enum(["markdown"]).optional().describe("Content format (markdown, the default)."),
    },
    async ({ api_key, name, content, format }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const id = newId("memory");
      const now = new Date();
      const claim = auth ? null : mintResourceClaimToken();

      const [row] = await db
        .insert(memory)
        .values({
          id,
          organizationId: auth ? auth.organizationId : null,
          name,
          content,
          format: format ?? "markdown",
          claimTokenHash: claim?.hash ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const data = claim
        ? { ...serializeMemory(row), claim_token: claim.token }
        : serializeMemory(row);

      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── memory_update ───────────────────────────────────────────────────────────
  server.tool(
    "memory_update",
    "Update a memory's name or content.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().describe("The memory ID."),
      name: z.string().min(1).max(200).optional().describe("New name."),
      content: z.string().max(1_000_000).optional().describe("New content (markdown)."),
    },
    async ({ api_key, id, name, content }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const rows = await db.select().from(memory).where(eq(memory.id, id)).limit(1);
      if (rows.length === 0) {
        return errorText(`No memory with ID '${id}' exists.`);
      }
      if (!canAccess(rows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      const updates: Partial<typeof memory.$inferInsert> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (content !== undefined) updates.content = content;

      const [updated] = await db
        .update(memory)
        .set(updates)
        .where(eq(memory.id, id))
        .returning();

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(serializeMemory(updated), null, 2) },
        ],
      };
    }
  );

  // ── memory_delete ───────────────────────────────────────────────────────────
  server.tool(
    "memory_delete",
    "Delete a memory.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().describe("The memory ID to delete."),
    },
    async ({ api_key, id }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const rows = await db.select().from(memory).where(eq(memory.id, id)).limit(1);
      if (rows.length === 0) {
        return errorText(`No memory with ID '${id}' exists.`);
      }
      if (!canAccess(rows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      await db.delete(memory).where(eq(memory.id, id));

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ deleted: true, id }, null, 2) }],
      };
    }
  );
}
