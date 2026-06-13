import { and, eq, lt, or, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * Cursor-pagination predicate: rows strictly older than the cursor row in
 * (time desc, id desc) order. SQLite timestamps have millisecond precision,
 * so ties on the time column are real (rows created in the same ms); the id
 * column breaks them deterministically. Pair with
 * `orderBy(desc(timeCol), desc(idCol))`.
 */
export function beforeCursor(
  timeCol: SQLiteColumn,
  idCol: SQLiteColumn,
  time: Date,
  id: string
): SQL {
  return or(lt(timeCol, time), and(eq(timeCol, time), lt(idCol, id)))!;
}
