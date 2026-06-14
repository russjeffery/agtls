import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artifact } from "@/lib/db/schema";
import { newId } from "@/lib/api/ids";
import { serializeArtifact } from "@/lib/api/serialize";
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

export function artifactTools(server: McpServer): void {
  // ── artifact_read ─────────────────────────────────────────────────────────────
  server.tool(
    "artifact_read",
    "Read artifacts. Pass an `id` to fetch a single artifact (with full content), " +
      "or omit it to list artifacts. Anonymous callers can't list, but can fetch a " +
      "public artifact by ID.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      id: z.string().optional().describe("Artifact ID — when set, returns that single artifact."),
      limit: z.number().int().min(1).max(100).optional().describe("List size (1–100, default 20)."),
      after: z.string().optional().describe("List cursor: ID of the last artifact from the previous page."),
    },
    async (args, extra) => {
      let auth: AuthContext | null;
      try {
        auth = await getAuth(args.api_key, extra);
      } catch (e: unknown) {
        return mcpError(e instanceof Error ? e.message : "Invalid API key.");
      }

      if (args.id) {
        const [row] = await db.select().from(artifact).where(eq(artifact.id, args.id)).limit(1);
        if (!row) return mcpError(`No artifact with ID '${args.id}' exists.`);
        if (!canAccess(row.organizationId, auth?.organizationId)) {
          return mcpError("You do not have access to this resource.");
        }
        return mcpOk(serializeArtifact(row));
      }

      if (!auth) {
        return mcpOk({ object: "list", data: [], has_more: false, next_cursor: null });
      }

      return mcpOk(
        await paginatedList({
          table: artifact,
          timeColumn: artifact.createdAt,
          idColumn: artifact.id,
          where: eq(artifact.organizationId, auth.organizationId),
          serialize: serializeArtifact,
          limit: clampLimit(args.limit),
          after: args.after,
        })
      );
    }
  );

  // ── artifact_write ────────────────────────────────────────────────────────────
  server.tool(
    "artifact_write",
    "Create, update, or delete a file artifact. `create` requires `name` and " +
      "`content` (markdown by default, or html); `update`/`delete` require `id`.",
    {
      api_key: z.string().optional().describe("Optional API key for authentication."),
      action: z.enum(["create", "update", "delete"]).describe("The operation to perform."),
      id: z.string().optional().describe("Artifact ID (required for update/delete)."),
      name: z.string().min(1).max(200).optional().describe("Name/label (required for create)."),
      content: z.string().max(1_000_000).optional().describe("Artifact content (required for create)."),
      format: z.enum(["markdown", "html"]).optional().describe("Content format (markdown is the default)."),
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
        if (!args.name) return mcpError("`name` is required to create an artifact.");
        if (args.content === undefined) {
          return mcpError("`content` is required to create an artifact.");
        }

        const now = new Date();
        const claim = auth ? null : mintResourceClaimToken();
        const [row] = await db
          .insert(artifact)
          .values({
            id: newId("artifact"),
            organizationId: auth ? auth.organizationId : null,
            name: args.name,
            content: args.content,
            format: args.format ?? "markdown",
            claimTokenHash: claim?.hash ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return mcpOk(
          claim ? { ...serializeArtifact(row), claim_token: claim.token } : serializeArtifact(row)
        );
      }

      if (!args.id) return mcpError(`\`id\` is required to ${args.action} an artifact.`);

      const [row] = await db.select().from(artifact).where(eq(artifact.id, args.id)).limit(1);
      if (!row) return mcpError(`No artifact with ID '${args.id}' exists.`);
      if (!canAccess(row.organizationId, auth?.organizationId)) {
        return mcpError("You do not have access to this resource.");
      }

      // ── delete ──
      if (args.action === "delete") {
        await db.delete(artifact).where(eq(artifact.id, args.id));
        return mcpOk({ id: args.id, object: "artifact", deleted: true });
      }

      // ── update ──
      const updates: Partial<typeof artifact.$inferInsert> = { updatedAt: new Date() };
      if (args.name !== undefined) updates.name = args.name;
      if (args.content !== undefined) updates.content = args.content;
      if (args.format !== undefined) updates.format = args.format;

      const [updated] = await db
        .update(artifact)
        .set(updates)
        .where(eq(artifact.id, args.id))
        .returning();

      return mcpOk(serializeArtifact(updated));
    }
  );
}
