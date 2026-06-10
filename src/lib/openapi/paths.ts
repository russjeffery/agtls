import { z } from "zod";
import {
  taskCreateSchema,
  taskPatchSchema,
  subtaskCreateSchema,
  subtaskPatchSchema,
  webhookCreateSchema,
  webhookPatchSchema,
  memoryCreateSchema,
  memoryPatchSchema,
  messageCreateSchema,
  messagePatchSchema,
  claimSchema,
} from "@/lib/api/schemas";
import type { JSONSchema } from "./components";

// Convert a Zod request schema to an OpenAPI 3.1 schema object. Zod 4 emits JSON
// Schema 2020-12, which OpenAPI 3.1 accepts directly — we only strip the top-level
// $schema marker, which isn't valid inside components.
function fromZod(schema: z.ZodType): JSONSchema {
  const { $schema, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void $schema;
  return rest;
}

function jsonBody(schema: z.ZodType): JSONSchema {
  return {
    required: true,
    content: { "application/json": { schema: fromZod(schema) } },
  };
}

function jsonResponse(description: string, schemaRef: string): JSONSchema {
  return {
    description,
    content: { "application/json": { schema: { $ref: schemaRef } } },
  };
}

const listParams = [
  { $ref: "#/components/parameters/limit" },
  { $ref: "#/components/parameters/after" },
];

const idParam = (resource: string, prefix: string): JSONSchema => ({
  name: "id",
  in: "path",
  required: true,
  description: `The ${resource} ID (\`${prefix}_…\`).`,
  schema: { type: "string" },
});

const errorRefs = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "404": { $ref: "#/components/responses/NotFound" },
};

export const paths: Record<string, JSONSchema> = {
  "/api/tasks": {
    get: {
      tags: ["Tasks"],
      summary: "List tasks",
      description:
        "Lists tasks scoped to the caller's organizations. Anonymous callers receive an empty list — public tasks remain reachable by ID but are never enumerable.",
      parameters: listParams,
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse("A list of tasks.", "#/components/schemas/TaskList"),
        "401": errorRefs["401"],
      },
    },
    post: {
      tags: ["Tasks"],
      summary: "Create a task",
      description:
        "Creates a task. With an API key the task is owned by the key's organization; without one it is created public and the response includes a one-time `claim_token`.",
      security: [{}, { bearerAuth: [] }],
      requestBody: jsonBody(taskCreateSchema),
      responses: {
        "201": jsonResponse("The created task.", "#/components/schemas/TaskCreateResponse"),
        "400": errorRefs["400"],
        "401": errorRefs["401"],
      },
    },
  },

  "/api/tasks/{id}": {
    parameters: [idParam("task", "tsk")],
    get: {
      tags: ["Tasks"],
      summary: "Get a task",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse("The task.", "#/components/schemas/Task"),
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    patch: {
      tags: ["Tasks"],
      summary: "Update a task",
      security: [{}, { bearerAuth: [] }],
      requestBody: jsonBody(taskPatchSchema),
      responses: {
        "200": jsonResponse("The updated task.", "#/components/schemas/Task"),
        "400": errorRefs["400"],
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    delete: {
      tags: ["Tasks"],
      summary: "Delete a task",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "204": { description: "The task was deleted." },
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
  },

  "/api/tasks/{id}/subtasks": {
    parameters: [idParam("task", "tsk")],
    get: {
      tags: ["Subtasks"],
      summary: "List a task's subtasks",
      parameters: listParams,
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse("A list of subtasks.", "#/components/schemas/SubtaskList"),
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    post: {
      tags: ["Subtasks"],
      summary: "Create a subtask under a task",
      description:
        "Creates a subtask attached to the given task. The path task ID takes precedence over any `task_id` in the body.",
      security: [{}, { bearerAuth: [] }],
      requestBody: jsonBody(subtaskCreateSchema),
      responses: {
        "201": jsonResponse(
          "The created subtask.",
          "#/components/schemas/SubtaskCreateResponse"
        ),
        "400": errorRefs["400"],
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
  },

  "/api/subtasks": {
    get: {
      tags: ["Subtasks"],
      summary: "List subtasks",
      description:
        "Lists subtasks scoped to the caller's organizations. Anonymous callers receive an empty list.",
      parameters: listParams,
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse("A list of subtasks.", "#/components/schemas/SubtaskList"),
        "401": errorRefs["401"],
      },
    },
    post: {
      tags: ["Subtasks"],
      summary: "Create a subtask",
      description:
        "Creates a subtask, optionally attached to a task via `task_id`. Without an API key the response includes a one-time `claim_token`.",
      security: [{}, { bearerAuth: [] }],
      requestBody: jsonBody(subtaskCreateSchema),
      responses: {
        "201": jsonResponse(
          "The created subtask.",
          "#/components/schemas/SubtaskCreateResponse"
        ),
        "400": errorRefs["400"],
        "401": errorRefs["401"],
      },
    },
  },

  "/api/subtasks/{id}": {
    parameters: [idParam("subtask", "sub")],
    get: {
      tags: ["Subtasks"],
      summary: "Get a subtask",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse("The subtask.", "#/components/schemas/Subtask"),
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    patch: {
      tags: ["Subtasks"],
      summary: "Update a subtask",
      security: [{}, { bearerAuth: [] }],
      requestBody: jsonBody(subtaskPatchSchema),
      responses: {
        "200": jsonResponse("The updated subtask.", "#/components/schemas/Subtask"),
        "400": errorRefs["400"],
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    delete: {
      tags: ["Subtasks"],
      summary: "Delete a subtask",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "204": { description: "The subtask was deleted." },
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
  },

  "/api/webhooks": {
    get: {
      tags: ["Webhooks"],
      summary: "List webhook endpoints",
      parameters: listParams,
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse(
          "A list of webhook endpoints.",
          "#/components/schemas/WebhookEndpointList"
        ),
        "401": errorRefs["401"],
      },
    },
    post: {
      tags: ["Webhooks"],
      summary: "Create a webhook endpoint",
      description:
        "Creates a webhook endpoint with a capture URL. Without an API key the response includes a one-time `claim_token`.",
      security: [{}, { bearerAuth: [] }],
      requestBody: jsonBody(webhookCreateSchema),
      responses: {
        "201": jsonResponse(
          "The created webhook endpoint.",
          "#/components/schemas/WebhookEndpointCreateResponse"
        ),
        "400": errorRefs["400"],
        "401": errorRefs["401"],
      },
    },
  },

  "/api/webhooks/{id}": {
    parameters: [idParam("webhook endpoint", "whe")],
    get: {
      tags: ["Webhooks"],
      summary: "Get a webhook endpoint",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse(
          "The webhook endpoint.",
          "#/components/schemas/WebhookEndpoint"
        ),
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    patch: {
      tags: ["Webhooks"],
      summary: "Update a webhook endpoint",
      security: [{}, { bearerAuth: [] }],
      requestBody: jsonBody(webhookPatchSchema),
      responses: {
        "200": jsonResponse(
          "The updated webhook endpoint.",
          "#/components/schemas/WebhookEndpoint"
        ),
        "400": errorRefs["400"],
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    delete: {
      tags: ["Webhooks"],
      summary: "Delete a webhook endpoint",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "204": { description: "The endpoint was deleted." },
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
  },

  "/api/webhooks/{id}/events": {
    parameters: [idParam("webhook endpoint", "whe")],
    get: {
      tags: ["Webhooks"],
      summary: "List captured events for an endpoint",
      parameters: listParams,
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse(
          "A list of captured events.",
          "#/components/schemas/WebhookEventList"
        ),
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    delete: {
      tags: ["Webhooks"],
      summary: "Delete all events for an endpoint",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "204": { description: "All events were deleted." },
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
  },

  "/api/webhooks/{id}/events/{eventId}": {
    parameters: [
      idParam("webhook endpoint", "whe"),
      {
        name: "eventId",
        in: "path",
        required: true,
        description: "The webhook event ID (`wev_…`).",
        schema: { type: "string" },
      },
    ],
    get: {
      tags: ["Webhooks"],
      summary: "Get a captured event",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse("The webhook event.", "#/components/schemas/WebhookEvent"),
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    delete: {
      tags: ["Webhooks"],
      summary: "Delete a captured event",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "204": { description: "The event was deleted." },
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
  },

  "/api/memories": {
    get: {
      tags: ["Memory"],
      summary: "List memories",
      description:
        "Lists memories scoped to the caller's organizations. Anonymous callers receive an empty list — public memories remain reachable by ID but are never enumerable.",
      parameters: listParams,
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse("A list of memories.", "#/components/schemas/MemoryList"),
        "401": errorRefs["401"],
      },
    },
    post: {
      tags: ["Memory"],
      summary: "Create a memory",
      description:
        "Creates a memory (markdown content). With an API key it is owned by the key's organization; without one it is created public and the response includes a one-time `claim_token`.",
      security: [{}, { bearerAuth: [] }],
      requestBody: jsonBody(memoryCreateSchema),
      responses: {
        "201": jsonResponse("The created memory.", "#/components/schemas/MemoryCreateResponse"),
        "400": errorRefs["400"],
        "401": errorRefs["401"],
      },
    },
  },

  "/api/memories/{id}": {
    parameters: [idParam("memory", "memo")],
    get: {
      tags: ["Memory"],
      summary: "Get a memory",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse("The memory.", "#/components/schemas/Memory"),
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    patch: {
      tags: ["Memory"],
      summary: "Update a memory",
      security: [{}, { bearerAuth: [] }],
      requestBody: jsonBody(memoryPatchSchema),
      responses: {
        "200": jsonResponse("The updated memory.", "#/components/schemas/Memory"),
        "400": errorRefs["400"],
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    delete: {
      tags: ["Memory"],
      summary: "Delete a memory",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "204": { description: "The memory was deleted." },
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
  },

  "/api/messages": {
    get: {
      tags: ["Messages"],
      summary: "List scheduled messages",
      description:
        "Lists scheduled messages scoped to the caller's organizations. Anonymous callers receive an empty list.",
      parameters: listParams,
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse(
          "A list of scheduled messages.",
          "#/components/schemas/ScheduledMessageList"
        ),
        "401": errorRefs["401"],
      },
    },
    post: {
      tags: ["Messages"],
      summary: "Schedule a message",
      description:
        "Schedules an HTTP request to fire at a later time. Provide exactly one of `scheduled_at` (absolute Unix seconds) or `delay_seconds` (relative to now). Without an API key the response includes a one-time `claim_token`.",
      security: [{}, { bearerAuth: [] }],
      requestBody: jsonBody(messageCreateSchema),
      responses: {
        "201": jsonResponse(
          "The scheduled message.",
          "#/components/schemas/ScheduledMessageCreateResponse"
        ),
        "400": errorRefs["400"],
        "401": errorRefs["401"],
      },
    },
  },

  "/api/messages/{id}": {
    parameters: [idParam("scheduled message", "msg")],
    get: {
      tags: ["Messages"],
      summary: "Get a scheduled message",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": jsonResponse(
          "The scheduled message.",
          "#/components/schemas/ScheduledMessage"
        ),
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    patch: {
      tags: ["Messages"],
      summary: "Reschedule or edit a message",
      description:
        "Updates a message that hasn't fired yet (status `scheduled`). Editing a delivered, in-flight, or canceled message returns 400.",
      security: [{}, { bearerAuth: [] }],
      requestBody: jsonBody(messagePatchSchema),
      responses: {
        "200": jsonResponse(
          "The updated message.",
          "#/components/schemas/ScheduledMessage"
        ),
        "400": errorRefs["400"],
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
    delete: {
      tags: ["Messages"],
      summary: "Cancel and delete a message",
      description:
        "Deletes the message. If it hasn't fired yet, this cancels it.",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "204": { description: "The message was deleted." },
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
  },

  "/api/messages/dispatch": {
    post: {
      tags: ["Messages"],
      summary: "Dispatch due messages",
      description:
        "Delivers every scheduled message whose time has come. Intended to be called on an interval by a scheduler (e.g. a cron). If `CRON_SECRET` is configured, the caller must present it as `Authorization: Bearer <secret>`.",
      security: [{}, { bearerAuth: [] }],
      responses: {
        "200": {
          description: "Summary of the dispatch run.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  object: { type: "string", const: "dispatch_result" },
                  dispatched: { type: "integer" },
                  delivered: { type: "integer" },
                  failed: { type: "integer" },
                  results: { type: "array", items: { type: "object" } },
                },
                required: ["object", "dispatched", "delivered", "failed", "results"],
              },
            },
          },
        },
        "401": errorRefs["401"],
      },
    },
  },

  "/api/claim/{id}": {
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description:
          "The ID of the public resource to claim (tsk_…, sub_…, wh_…, memo_…, or msg_…).",
        schema: { type: "string" },
      },
    ],
    post: {
      tags: ["Claim"],
      summary: "Claim a public resource",
      description:
        "Assigns a publicly-created resource to the caller's organization using its one-time `claim_token`. Requires an API key.",
      security: [{ bearerAuth: [] }],
      requestBody: jsonBody(claimSchema),
      responses: {
        "200": {
          description: "The claimed resource, now owned by the caller's organization.",
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  { $ref: "#/components/schemas/Task" },
                  { $ref: "#/components/schemas/Subtask" },
                  { $ref: "#/components/schemas/WebhookEndpoint" },
                ],
              },
            },
          },
        },
        "400": errorRefs["400"],
        "401": errorRefs["401"],
        "403": errorRefs["403"],
        "404": errorRefs["404"],
      },
    },
  },

  "/api/catch/{id}": {
    parameters: [idParam("webhook endpoint", "whe")],
    ...Object.fromEntries(
      ["get", "post", "put", "patch", "delete"].map((method) => [
        method,
        {
          tags: ["Webhooks"],
          summary: `Capture an inbound ${method.toUpperCase()} request`,
          description:
            "Records the inbound request (method, headers, query, body) as a webhook event. Always returns 200 and never reveals whether the endpoint exists. Accepts any content type.",
          requestBody:
            method === "get"
              ? undefined
              : { required: false, content: { "*/*": { schema: {} } } },
          responses: {
            "200": {
              description: "The request was captured.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      received: { type: "boolean", const: true },
                      event_id: { type: "string" },
                    },
                    required: ["received", "event_id"],
                  },
                },
              },
            },
          },
        },
      ])
    ),
  },
};
