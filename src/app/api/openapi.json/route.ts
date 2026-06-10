import { NextRequest, NextResponse } from "next/server";
import { stringify } from "yaml";
import { getOpenApiDocument } from "@/lib/openapi/document";

// GET /api/openapi.json — the OpenAPI 3.1 spec for the public REST API.
// Returns JSON by default; pass ?format=yaml for YAML.
export async function GET(request: NextRequest) {
  const doc = getOpenApiDocument();
  const format = request.nextUrl.searchParams.get("format");

  if (format === "yaml" || format === "yml") {
    return new NextResponse(stringify(doc), {
      headers: {
        "Content-Type": "text/yaml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return NextResponse.json(doc, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
