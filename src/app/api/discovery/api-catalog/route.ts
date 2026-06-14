import { apiCatalogLinkset } from "@/lib/agent-auth/discovery";

// Served at /.well-known/api-catalog via a next.config rewrite (App Router does
// not reliably serve dot-prefixed segments). RFC 9727: returns the API catalog
// as an application/linkset+json document (RFC 9264).
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(JSON.stringify(apiCatalogLinkset()), {
    headers: {
      "Content-Type":
        'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
