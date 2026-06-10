import { NextRequest } from "next/server";
import { eq, desc, lt, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { memory } from "@/lib/db/schema";
import {
  resolveAuth,
  resolveViewer,
  viewerOrganizationIds,
  viewerUser,
} from "@/lib/api/middleware";
import { newId } from "@/lib/api/ids";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeMemory } from "@/lib/api/serialize";
import { mintResourceClaimToken } from "@/lib/api/claim";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";
import { memoryCreateSchema as createSchema } from "@/lib/api/schemas";

export async function GET(request: NextRequest) {
  let viewer;
  try {
    viewer = await resolveViewer(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const after = searchParams.get("after");

  // Lists are scoped to the caller's organizations. Anonymous callers (scope
  // null) get an empty list — public memories stay reachable by ID but are
  // never enumerable.
  const scope = viewerOrganizationIds(viewer);

  let rows: (typeof memory.$inferSelect)[] = [];
  if (scope !== null && scope.length > 0) {
    const ownershipCondition = inArray(memory.organizationId, scope);

    let cursorCondition;
    if (after) {
      const cursor = await db
        .select({ createdAt: memory.createdAt })
        .from(memory)
        .where(eq(memory.id, after))
        .limit(1);
      if (cursor.length > 0) {
        cursorCondition = lt(memory.createdAt, cursor[0].createdAt);
      }
    }

    const conditions = cursorCondition
      ? and(ownershipCondition, cursorCondition)
      : ownershipCondition;

    rows = await db
      .select()
      .from(memory)
      .where(conditions)
      .orderBy(desc(memory.createdAt))
      .limit(limit + 1);
  }

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((r) => serializeMemory(r));
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  if (wantsHtml(request)) {
    const signedOut = scope === null;
    return htmlResponse(
      {
        title: "Memory",
        breadcrumb: [
          { label: "API", href: "/api" },
          { label: "memories", href: "/api/memories" },
        ],
        description:
          "Markdown notes an agent can store and recall. Each memory is a single file of content.",
        user: viewerUser(viewer),
        notice: signedOut
          ? {
              title: "Sign in to see your memories",
              message:
                "Memories are scoped to your account. Sign in to list the memories in your organizations — or pass an API key when calling this endpoint.",
              actions: [
                { label: "Sign in", href: "/sign-in", primary: true },
                { label: "Create an account", href: "/sign-up" },
              ],
            }
          : undefined,
        createForm: signedOut
          ? undefined
          : {
              title: "New memory",
              endpoint: "/api/memories",
              submitLabel: "Create memory",
              fields: [
                {
                  name: "name",
                  label: "Name",
                  placeholder: "Project context",
                  required: true,
                },
                {
                  name: "content",
                  label: "Content (markdown)",
                  type: "textarea",
                  placeholder: "# Notes\n…",
                  required: true,
                },
              ],
            },
        list: signedOut
          ? undefined
          : {
              items: data as Record<string, unknown>[],
              columns: [
                { key: "id", label: "ID", mono: true },
                { key: "name", label: "Name" },
                { key: "format", label: "Format" },
                { key: "created_at", label: "Created" },
              ],
              itemHref: (item) => `/api/memories/${(item as { id: string }).id}`,
              actions: {
                deleteConfirm: (item) =>
                  `Delete memory ${(item as { id: string }).id}? This permanently removes its content.`,
              },
              hasMore,
              nextCursor,
            },
        apiRef: [
          { method: "GET", path: "/api/memories", description: "List memories." },
          {
            method: "POST",
            path: "/api/memories",
            description: "Create a memory (markdown content).",
          },
        ],
      },
      request
    );
  }

  return listResponse(data, hasMore, nextCursor);
}

export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await resolveAuth(request);
  } catch (e: unknown) {
    return errorResponse(
      errors.unauthorized(e instanceof Error ? e.message : undefined),
      401
    );
  }

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  const id = newId("memory");
  const now = new Date();

  // Public creation gets a claim token so the resource can later be attached
  // to an organization via POST /api/claim/{id}. Returned in plaintext exactly once.
  const claim = auth ? null : mintResourceClaimToken();

  const [row] = await db
    .insert(memory)
    .values({
      id,
      organizationId: auth ? auth.organizationId : null,
      name: body.name,
      content: body.content,
      format: body.format ?? "markdown",
      claimTokenHash: claim?.hash ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (wantsHtml(request)) {
    return Response.redirect(
      new URL(`/api/memories/${row.id}`, request.url).toString(),
      303
    );
  }

  return created(
    claim
      ? {
          ...serializeMemory(row),
          claim_token: claim.token,
          claim_url: `/api/claim/${row.id}`,
        }
      : serializeMemory(row)
  );
}
