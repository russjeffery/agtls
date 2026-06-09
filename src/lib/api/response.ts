import { NextResponse } from "next/server";
import type { ApiError } from "./errors";

export type ResourceObject = Record<string, unknown> & {
  id: string;
  object: string;
  created_at: number;
};

export interface ListResponse<T> {
  object: "list";
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
  total_count?: number;
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function errorResponse(error: ApiError, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export function listResponse<T>(
  data: T[],
  hasMore: boolean,
  nextCursor: string | null,
  totalCount?: number
): NextResponse {
  const body: ListResponse<T> = {
    object: "list",
    data,
    has_more: hasMore,
    next_cursor: nextCursor,
  };
  if (totalCount !== undefined) body.total_count = totalCount;
  return NextResponse.json(body);
}

// Convert DB timestamps to Unix seconds (Stripe convention)
export function toUnix(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.floor(date.getTime() / 1000);
}
