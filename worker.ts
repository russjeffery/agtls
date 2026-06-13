// Custom Worker entry (wrangler.jsonc `main`). Wraps the OpenNext-generated
// fetch handler to add, on top of the Next app:
//   - a `scheduled` handler (the generated worker only exposes `fetch`, and
//     the message-dispatch cron needs `scheduled`)
//   - the www → apex 301 redirect
//   - search-engine de-indexing for the preview deployment (NOINDEX var)
//
// Typed structurally rather than against the workerd globals: the generated
// runtime types (cloudflare-env.d.ts) are excluded from tsconfig because they
// clash with the DOM lib types the app is checked against.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- not expect-error: the import only resolves once `opennextjs-cloudflare build` has generated it
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";

type Env = {
  NEXT_PUBLIC_APP_URL?: string;
  CRON_SECRET?: string;
  // "1" on the preview environment (wrangler.jsonc `env.preview.vars`).
  NOINDEX?: string;
};

const worker = {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    const url = new URL(request.url);

    // www.agtls.dev (or any www. host) permanently redirects to the apex —
    // the app must live on a single canonical origin because BETTER_AUTH_URL,
    // cookies, and the ID-JAG audience are all pinned to it.
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice("www.".length);
      return Response.redirect(url.toString(), 301);
    }

    // Preview deployments must never be indexed: serve a deny-all robots.txt
    // and stamp every response with X-Robots-Tag.
    if (env.NOINDEX === "1") {
      if (url.pathname === "/robots.txt") {
        return new Response("User-agent: *\nDisallow: /\n", {
          headers: { "content-type": "text/plain" },
        });
      }
      const response: Response = await handler.fetch(request, env, ctx);
      const headers = new Headers(response.headers);
      headers.set("x-robots-tag", "noindex, nofollow");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return handler.fetch(request, env, ctx);
  },

  // Cron trigger (wrangler.jsonc `triggers.crons`, every minute): deliver due
  // scheduled messages by invoking POST /api/messages/dispatch through the
  // Next handler in-process — no public egress, and the route keeps working
  // for external schedulers too. CRON_SECRET (if set) authorizes the call
  // exactly like an external caller.
  async scheduled(_controller: unknown, env: Env, ctx: unknown) {
    const base = env.NEXT_PUBLIC_APP_URL ?? "http://localhost";
    const headers = new Headers();
    if (env.CRON_SECRET) {
      headers.set("authorization", `Bearer ${env.CRON_SECRET}`);
    }
    const response: Response = await handler.fetch(
      new Request(new URL("/api/messages/dispatch", base), {
        method: "POST",
        headers,
      }),
      env,
      ctx
    );
    if (!response.ok) {
      console.error(
        `cron dispatch failed: HTTP ${response.status} ${await response.text()}`
      );
    }
  },
};

export default worker;
