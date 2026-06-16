import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";

// Agent Auth Protocol discovery document for the @better-auth/agent-auth
// plugin. Served at /.well-known/agent-configuration via a next.config rewrite
// (the App Router does not reliably serve dot-prefixed path segments).
export const dynamic = "force-dynamic";

export async function GET() {
  const configuration = await auth.api.getAgentConfiguration();
  return NextResponse.json(configuration, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
