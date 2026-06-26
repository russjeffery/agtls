import pkg from "../../../package.json";
import { schemas, parameters, responses, securitySchemes } from "./components";
import { paths } from "./paths";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

// Stable operationIds — these become method names in generated SDKs, so they're
// named by intent rather than auto-derived from the path.
const operationIds: Record<string, string> = {
  "get /api/tasks": "listTasks",
  "post /api/tasks": "createTask",
  "get /api/tasks/{id}": "getTask",
  "patch /api/tasks/{id}": "updateTask",
  "delete /api/tasks/{id}": "deleteTask",
  "get /api/webhooks": "listWebhookEndpoints",
  "post /api/webhooks": "createWebhookEndpoint",
  "get /api/webhooks/{id}": "getWebhookEndpoint",
  "patch /api/webhooks/{id}": "updateWebhookEndpoint",
  "delete /api/webhooks/{id}": "deleteWebhookEndpoint",
  "get /api/webhooks/{id}/events": "listWebhookEvents",
  "delete /api/webhooks/{id}/events": "deleteAllWebhookEvents",
  "get /api/webhooks/{id}/events/{eventId}": "getWebhookEvent",
  "delete /api/webhooks/{id}/events/{eventId}": "deleteWebhookEvent",
  "get /api/artifacts": "listArtifacts",
  "post /api/artifacts": "createArtifact",
  "get /api/artifacts/{id}": "getArtifact",
  "patch /api/artifacts/{id}": "updateArtifact",
  "delete /api/artifacts/{id}": "deleteArtifact",
  "get /api/artifacts/{id}/raw": "getArtifactRaw",
  "get /api/messages": "listMessages",
  "post /api/messages": "scheduleMessage",
  "get /api/messages/{id}": "getMessage",
  "patch /api/messages/{id}": "updateMessage",
  "delete /api/messages/{id}": "deleteMessage",
  "post /api/messages/dispatch": "dispatchMessages",
  "post /api/claim/{id}": "claimResource",
  "get /api/catch/{id}": "captureRequestGet",
  "post /api/catch/{id}": "captureRequestPost",
  "put /api/catch/{id}": "captureRequestPut",
  "patch /api/catch/{id}": "captureRequestPatch",
  "delete /api/catch/{id}": "captureRequestDelete",
};

// Attach the operationId to each documented operation (in place on a fresh build).
function withOperationIds(
  pathsObj: Record<string, Record<string, unknown>>
): Record<string, Record<string, unknown>> {
  for (const [path, item] of Object.entries(pathsObj)) {
    for (const method of HTTP_METHODS) {
      const op = item[method] as Record<string, unknown> | undefined;
      const id = operationIds[`${method} ${path}`];
      if (op && id) op.operationId = id;
    }
  }
  return pathsObj;
}

// Builds the OpenAPI 3.1 document describing the public REST surface (core
// resources: tasks, webhooks + events, artifacts, messages, claim, catch).
// Pure — no IO — so the result is memoized below and reused across requests.
export function buildOpenApiDocument(): Record<string, unknown> {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");

  return {
    openapi: "3.1.0",
    info: {
      title: "Agent Tools API",
      version: pkg.version,
      description:
        "Open infrastructure for AI agents. API key auth is optional: without a key, " +
        "resources are created public (reachable by ID) and can later be claimed; with an " +
        "`agt_…` key, resources are owned by the key's organization. All timestamps are " +
        "Unix seconds. Lists use cursor pagination (`limit`, `after`).",
      // license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: appUrl }],
    security: [{}, { bearerAuth: [] }],
    tags: [
      {
        name: "Tasks",
        description:
          "Units of work with priorities, due dates, and labels for flexible grouping.",
      },
      { name: "Webhooks", description: "Capture and inspect inbound HTTP requests." },
      { name: "Artifacts", description: "Markdown files an agent can store and recall." },
      {
        name: "Messages",
        description: "Schedule HTTP requests to trigger an agent at a later time.",
      },
      { name: "Claim", description: "Take ownership of publicly-created resources." },
    ],
    paths: withOperationIds(
      structuredClone(paths) as Record<string, Record<string, unknown>>
    ),
    components: {
      schemas,
      parameters,
      responses,
      securitySchemes,
    },
  };
}

let cached: Record<string, unknown> | undefined;

export function getOpenApiDocument(): Record<string, unknown> {
  cached ??= buildOpenApiDocument();
  return cached;
}
