import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { beforeCursor } from "@/lib/api/cursor";
import { db } from "@/lib/db";
import { artifact } from "@/lib/db/schema";
import { resolveAuth } from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { serializeArtifact } from "@/lib/api/serialize";
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
  row: typeof artifact.$inferSelect,
  auth: { organizationId: string } | null
): boolean {
  if (row.organizationId === null) return true;
  if (!auth) return false;
  return auth.organizationId === row.organizationId;
}

function errorText(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

export function artifactTools(server: McpServer): void {
  // ── artifact_list ─────────────────────────────────────────────────────────────
  server.tool(
    "artifact_list",
    "List artifacts. Returns artifacts owned by the authenticated organization, or an empty list if no API key is provided (public artifacts stay reachable by ID via artifact_get).",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of results (1–100, default 20)."),
      after: z.string().optional().describe("Cursor: ID of the last artifact from the previous page."),
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
      const ownershipCondition = eq(artifact.organizationId, auth.organizationId);

      let cursorCondition;
      if (after) {
        const cursor = await db
          .select({ createdAt: artifact.createdAt })
          .from(artifact)
          .where(eq(artifact.id, after))
          .limit(1);
        if (cursor.length > 0) {
          cursorCondition = beforeCursor(
            artifact.createdAt,
            artifact.id,
            cursor[0].createdAt,
            after
          );
        }
      }

      const conditions = cursorCondition
        ? and(ownershipCondition, cursorCondition)
        : ownershipCondition;

      const rows = await db
        .select()
        .from(artifact)
        .where(conditions)
        .orderBy(desc(artifact.createdAt), desc(artifact.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit).map((r) => serializeArtifact(r));

      const result = {
        object: "list",
        data,
        has_more: hasMore,
        next_cursor: hasMore ? data[data.length - 1].id : null,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── artifact_get ──────────────────────────────────────────────────────────────
  server.tool(
    "artifact_get",
    "Get a single artifact by ID, including its full content.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().describe("The artifact ID (e.g. art_...)."),
    },
    async ({ api_key, id }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const rows = await db.select().from(artifact).where(eq(artifact.id, id)).limit(1);
      if (rows.length === 0) {
        return errorText(`No artifact with ID '${id}' exists.`);
      }
      if (!canAccess(rows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(serializeArtifact(rows[0]), null, 2) },
        ],
      };
    }
  );

  // ── artifact_create ───────────────────────────────────────────────────────────
  server.tool(
    "artifact_create",
    "Create a artifact. Stores a file of content for later recall. Accepts markdown (the default) or html; the raw_url in the response serves the content with the matching content type (text/html for html).",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      name: z.string().min(1).max(200).describe("Name/label for the artifact."),
      content: z.string().max(1_000_000).describe("The artifact content."),
      format: z.enum(["markdown", "html"]).optional().describe("Content format (markdown, the default, or html)."),
    },
    async ({ api_key, name, content, format }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const id = newId("artifact");
      const now = new Date();
      const claim = auth ? null : mintResourceClaimToken();

      const [row] = await db
        .insert(artifact)
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
        ? { ...serializeArtifact(row), claim_token: claim.token }
        : serializeArtifact(row);

      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── artifact_update ───────────────────────────────────────────────────────────
  server.tool(
    "artifact_update",
    "Update a artifact's name, content, or format.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().describe("The artifact ID."),
      name: z.string().min(1).max(200).optional().describe("New name."),
      content: z.string().max(1_000_000).optional().describe("New content."),
      format: z.enum(["markdown", "html"]).optional().describe("New content format."),
    },
    async ({ api_key, id, name, content, format }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const rows = await db.select().from(artifact).where(eq(artifact.id, id)).limit(1);
      if (rows.length === 0) {
        return errorText(`No artifact with ID '${id}' exists.`);
      }
      if (!canAccess(rows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      const updates: Partial<typeof artifact.$inferInsert> = { updatedAt: new Date() };
      if (name !== undefined) updates.name = name;
      if (content !== undefined) updates.content = content;
      if (format !== undefined) updates.format = format;

      const [updated] = await db
        .update(artifact)
        .set(updates)
        .where(eq(artifact.id, id))
        .returning();

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(serializeArtifact(updated), null, 2) },
        ],
      };
    }
  );

  // ── artifact_delete ───────────────────────────────────────────────────────────
  server.tool(
    "artifact_delete",
    "Delete a artifact.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().describe("The artifact ID to delete."),
    },
    async ({ api_key, id }) => {
      let auth;
      try {
        auth = await getAuth(api_key);
      } catch (e: unknown) {
        return errorText(e instanceof Error ? e.message : "Invalid API key.");
      }

      const rows = await db.select().from(artifact).where(eq(artifact.id, id)).limit(1);
      if (rows.length === 0) {
        return errorText(`No artifact with ID '${id}' exists.`);
      }
      if (!canAccess(rows[0], auth)) {
        return errorText("You do not have access to this resource.");
      }

      await db.delete(artifact).where(eq(artifact.id, id));

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ deleted: true, id }, null, 2) }],
      };
    }
  );
}
