import { NextRequest } from "next/server";

const BASE = "https://app.example.com";

export interface RequestInitLike {
  method?: string;
  /** JSON body — serialized and sent with application/json unless `accept`
   *  overrides it. */
  body?: unknown;
  /** Raw string body (takes precedence over `body`). */
  rawBody?: string;
  /** Bearer token, e.g. an `agt_live_…` key. */
  token?: string;
  /** Accept header. Pass "text/html,..." to exercise the HTML branch. */
  accept?: string;
  headers?: Record<string, string>;
}

/**
 * Build a NextRequest for invoking a route handler directly. Path may be
 * absolute ("/api/tasks?limit=5") and is resolved against the test origin.
 */
export function makeRequest(path: string, init: RequestInitLike = {}): NextRequest {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.accept) headers.set("accept", init.accept);

  let body: string | undefined;
  if (init.rawBody !== undefined) {
    body = init.rawBody;
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }

  const method = init.method ?? (body !== undefined ? "POST" : "GET");
  return new NextRequest(url, { method, headers, body });
}

/** Convenience: parse a handler Response's JSON body. */
export async function json<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/**
 * Build the second argument App-Router dynamic-segment handlers expect, e.g.
 *   GET(makeRequest(`/api/tasks/${id}`), routeParams({ id }))
 */
export function routeParams<T extends Record<string, string>>(params: T): {
  params: Promise<T>;
} {
  return { params: Promise.resolve(params) };
}
