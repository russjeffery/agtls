import { and, desc, eq, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db";
import { beforeCursor } from "@/lib/api/cursor";
import { resolveAuth } from "@/lib/api/middleware";
import type { AuthContext } from "@/lib/api/middleware";

// Shared building blocks for the MCP tools. Each resource used to re-implement
// auth resolution, error/ok envelopes, the ownership check, and cursor
// pagination; these live here once so the read/write tools stay thin.

// ─── Auth ──────────────────────────────────────────────────────────────────

/**
 * Resolve auth from either an explicit `api_key` arg or the MCP
 * `extra.authInfo.token`. Returns null for unauthenticated access; throws with
 * a message if the key is present but invalid.
 */
export async function getAuth(
  apiKey: string | undefined | null,
  extra?: { authInfo?: { token?: string } }
): Promise<AuthContext | null> {
  const token = apiKey ?? extra?.authInfo?.token;
  if (!token) return null;

  const fakeRequest = new Request("https://internal/mcp", {
    headers: { authorization: `Bearer ${token}` },
  });
  return resolveAuth(fakeRequest);
}

// ─── Result envelopes ────────────────────────────────────────────────────────

export function mcpOk(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function mcpError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

// ─── Ownership ───────────────────────────────────────────────────────────────

/**
 * Public resources (`organizationId === null`) are accessible to anyone; owned
 * resources require the caller's org to match.
 */
export function canAccess(
  resourceOrgId: string | null,
  authOrgId: string | null | undefined
): boolean {
  if (resourceOrgId === null) return true;
  return resourceOrgId === authOrgId;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export function clampLimit(raw: number | undefined | null, defaultVal = 20): number {
  if (!raw || isNaN(raw)) return defaultVal;
  return Math.min(Math.max(1, raw), 100);
}

/**
 * Cursor-paginated list in (time desc, id desc) order. Looks up the `after`
 * cursor row's time value, applies `beforeCursor`, and returns the standard
 * `{ object: "list", data, has_more, next_cursor }` envelope.
 */
export async function paginatedList<TRow, TOut extends { id: string }>(opts: {
  table: SQLiteTable;
  timeColumn: SQLiteColumn;
  idColumn: SQLiteColumn;
  where?: SQL;
  serialize: (row: TRow) => TOut;
  limit: number;
  after?: string;
}): Promise<{
  object: "list";
  data: TOut[];
  has_more: boolean;
  next_cursor: string | null;
}> {
  const { table, timeColumn, idColumn, where, serialize, limit, after } = opts;

  let cursorCondition: SQL | undefined;
  if (after) {
    const [cursorRow] = await db
      .select({ time: timeColumn })
      .from(table)
      .where(eq(idColumn, after))
      .limit(1);
    if (cursorRow) {
      cursorCondition = beforeCursor(timeColumn, idColumn, cursorRow.time as Date, after);
    }
  }

  const conditions = [where, cursorCondition].filter(Boolean) as SQL[];
  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = (await db
    .select()
    .from(table)
    .where(whereClause)
    .orderBy(desc(timeColumn), desc(idColumn))
    .limit(limit + 1)) as unknown as TRow[];

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(serialize);

  return {
    object: "list",
    data,
    has_more: hasMore,
    next_cursor: hasMore ? data[data.length - 1].id : null,
  };
}
