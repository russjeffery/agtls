import { NextResponse } from "next/server";
import { authorizationServerMetadata } from "@/lib/agent-auth/discovery";

// Served at /.well-known/oauth-authorization-server via a next.config rewrite.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(authorizationServerMetadata(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
