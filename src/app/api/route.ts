import { ok } from "@/lib/api/response";

const RESOURCES = [
  {
    resource: "tasks",
    href: "/api/tasks",
    description:
      "Tasks — create, list, and track work with priorities, due dates, and labels.",
  },
  {
    resource: "webhooks",
    href: "/api/webhooks",
    description: "Webhook endpoints and delivered events.",
  },
  {
    resource: "artifacts",
    href: "/api/artifacts",
    description: "Markdown files an agent can store and recall.",
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

export async function GET() {
  return ok({
    object: "api",
    resources: RESOURCES.map(({ resource, href, description }) => ({
      name: resource,
      url: href,
      description,
    })),
  });
}
