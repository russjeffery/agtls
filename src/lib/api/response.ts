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
  const init: { status: number; headers?: Record<string, string> } = { status };
  // Per RFC 9728 / auth.md: every 401 advertises where agents can discover how
  // to authenticate, so they can bootstrap the agent-auth flow off a 401.
  if (status === 401) {
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.BETTER_AUTH_URL ??
      "http://localhost:3000"
    ).replace(/\/$/, "");
    init.headers = {
      "WWW-Authenticate": `Bearer resource_metadata="${appUrl}/.well-known/oauth-protected-resource"`,
    };
  }
  return NextResponse.json({ error }, init);
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
