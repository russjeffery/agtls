import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artifact } from "@/lib/db/schema";
import { resolveViewer, viewerCanAccess } from "@/lib/api/middleware";
import { errorResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";

type Params = { params: Promise<{ id: string }> };

const CONTENT_TYPES: Record<string, string> = {
  markdown: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
};

// Serves the artifact body directly (not wrapped in the JSON resource), with
// the content type matching its format — a markdown artifact comes back as
// text/markdown, an html artifact renders in the browser as text/html.
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const rows = await db.select().from(artifact).where(eq(artifact.id, id)).limit(1);
  const row = rows[0];
  if (!row) {
    return errorResponse(errors.notFound("artifact", id), 404);
  }

  if (!viewerCanAccess(row.organizationId, viewer)) {
    return errorResponse(errors.forbidden(), 403);
  }

  const headers = new Headers({
    "Content-Type": CONTENT_TYPES[row.format] ?? "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  if (row.format === "html") {
    // Artifact HTML is untrusted user content served from the app's origin.
    // `sandbox` gives the document an opaque origin so its scripts can run but
    // can't reach agtls cookies, storage, or credentialed same-origin requests.
    headers.set("Content-Security-Policy", "sandbox allow-scripts");
  }

  return new Response(row.content, { headers });
}
