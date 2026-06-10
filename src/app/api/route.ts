import { NextRequest } from "next/server";
import { resolveViewer, viewerUser } from "@/lib/api/middleware";
import { errorResponse, ok } from "@/lib/api/response";
import { errors } from "@/lib/api/errors";
import { wantsHtml } from "@/lib/api/accepts";
import { htmlResponse } from "@/lib/api/html";

const RESOURCES = [
  {
    resource: "tasks",
    href: "/api/tasks",
    description: "Tasks and their subtasks — create, list, and track work.",
  },
  {
    resource: "webhooks",
    href: "/api/webhooks",
    description: "Webhook endpoints and delivered events.",
  },
  {
    resource: "memories",
    href: "/api/memories",
    description: "Markdown notes an agent can store and recall.",
  },
  {
    resource: "messages",
    href: "/api/messages",
    description: "Schedule an HTTP request to trigger an agent later.",
  },
  {
    resource: "organizations",
    href: "/api/organizations",
    description: "Organizations you belong to, including agent members.",
  },
];

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

  if (wantsHtml(request)) {
    return htmlResponse(
      {
        title: "API",
        breadcrumb: [{ label: "API", href: "/api" }],
        description:
          "Every endpoint speaks JSON to agents and renders HTML in a browser. Pick a resource to explore.",
        user: viewerUser(viewer),
        list: {
          items: RESOURCES as unknown as Record<string, unknown>[],
          columns: [
            { key: "resource", label: "Resource", mono: true },
            { key: "description", label: "Description" },
          ],
          itemHref: (item) => String(item.href),
          hasMore: false,
        },
      },
      request
    );
  }

  return ok({
    object: "api",
    resources: RESOURCES.map(({ resource, href, description }) => ({
      name: resource,
      url: href,
      description,
    })),
  });
}
