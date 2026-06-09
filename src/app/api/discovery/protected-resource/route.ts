import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@/lib/agent-auth/discovery";

// Served at /.well-known/oauth-protected-resource via a next.config rewrite.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(protectedResourceMetadata(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
