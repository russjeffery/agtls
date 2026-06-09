import { NextRequest } from "next/server";
import { eq, and, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { db, project, apiKey } from "@/lib/db";
import { auth as betterAuth } from "@/lib/auth/server";
import { newApiKey, newId } from "@/lib/api/ids";
import { hashApiKey } from "@/lib/api/middleware";
import { created, errorResponse, listResponse } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { serializeApiKey } from "@/lib/api/serialize";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";
import { headers } from "next/headers";

async function requireProjectOwner(projectId: string) {
  const session = await betterAuth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const [proj] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session.user.id)))
    .limit(1);

  if (!proj) throw new Error("NotFound");
  return { session, proj };
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  environment: z.enum(["live", "test"]).default("live"),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    await requireProjectOwner(id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NotFound") return errorResponse(errors.notFound("project", id), 404);
    return errorResponse(errors.unauthorized(), 401);
  }

  const rows = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.projectId, id), isNull(apiKey.revokedAt)))
    .orderBy(desc(apiKey.createdAt));

  const data = rows.map(serializeApiKey);

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: "API Keys",
        breadcrumb: [
          { label: "API", href: "/" },
          { label: "projects", href: "/api/projects" },
          { label: id, href: `/api/projects/${id}` },
          { label: "keys" },
        ],
        description: "API keys for this project. Keys are shown only once at creation.",
        list: {
          items: data as Record<string, unknown>[],
          columns: [
            { key: "id", label: "ID", mono: true },
            { key: "name", label: "Name" },
            { key: "key", label: "Key (prefix)", mono: true },
            { key: "environment", label: "Env", badge: { live: "#34d399", test: "#fbbf24" } },
            { key: "last_used_at", label: "Last Used" },
            { key: "created_at", label: "Created" },
          ],
          itemHref: (item) => `/api/projects/${id}/keys/${(item as { id: string }).id}`,
          hasMore: false,
          nextCursor: null,
        },
        apiRef: [
          { method: "GET", path: `/api/projects/${id}/keys`, description: "List active API keys." },
          { method: "POST", path: `/api/projects/${id}/keys`, description: "Create a key. The full key is shown only in the response — copy it now." },
        ],
      },
      request
    );
  }

  return listResponse(data, false, null, data.length);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    await requireProjectOwner(id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NotFound") return errorResponse(errors.notFound("project", id), 404);
    return errorResponse(errors.unauthorized(), 401);
  }

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Invalid request body.";
    return errorResponse(errors.invalidParam("body", msg), 400);
  }

  const rawKey = newApiKey(body.environment);
  const keyPrefix = rawKey.slice(0, 20);
  const keyHash = hashApiKey(rawKey);
  const keyId = newId("apiKey");

  await db.insert(apiKey).values({
    id: keyId,
    projectId: id,
    name: body.name,
    keyPrefix,
    keyHash,
    environment: body.environment,
    createdAt: new Date(),
  });

  const responseData = {
    id: keyId,
    object: "api_key" as const,
    project_id: id,
    name: body.name,
    key: rawKey,
    environment: body.environment,
    last_used_at: null,
    revoked_at: null,
    created_at: Math.floor(Date.now() / 1000),
  };

  if (wantsHtml(request)) {
    // Show the key in a special one-time page since we can't redirect (key would be lost)
    return htmlResponse(
      {
        title: keyId,
        objectType: "api_key",
        breadcrumb: [
          { label: "API", href: "/" },
          { label: "projects", href: "/api/projects" },
          { label: id, href: `/api/projects/${id}` },
          { label: "keys", href: `/api/projects/${id}/keys` },
          { label: keyId },
        ],
        description: "Save this API key now — it will not be shown again.",
        resource: responseData,
        apiRef: [
          { method: "DELETE", path: `/api/projects/${id}/keys/${keyId}`, description: "Revoke this key." },
        ],
      },
      request
    );
  }

  return created(responseData);
}
