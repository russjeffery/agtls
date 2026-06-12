// Hand-authored OpenAPI 3.1 components. These mirror the response serializers in
// src/lib/api/serialize.ts and the shared envelopes in response.ts / errors.ts, so
// the documented shapes match what the API actually returns. (The serializers are
// plain functions and can't be introspected, so the response side is described here.)

// JSON Schema fragment — kept loose; OpenAPI 3.1 is a superset of JSON Schema 2020-12.
export type JSONSchema = Record<string, unknown>;

const unixTimestamp = (description: string): JSONSchema => ({
  type: ["integer", "null"],
  description: `${description} Unix timestamp in seconds.`,
});

const idField = (prefix: string, object: string): JSONSchema => ({
  type: "string",
  description: `Unique identifier for the ${object}, prefixed with \`${prefix}_\`.`,
  examples: [`${prefix}_${"x".repeat(24)}`],
});

const organizationId: JSONSchema = {
  type: ["string", "null"],
  description:
    "Owning organization ID, or null if the resource is public (created without an API key).",
};

const Task: JSONSchema = {
  type: "object",
  description:
    "A task — a unit of work with a priority, an optional due date, and labels for flexible grouping.",
  properties: {
    id: idField("tsk", "task"),
    object: { type: "string", const: "task" },
    organization_id: organizationId,
    name: { type: "string" },
    description: { type: ["string", "null"] },
    priority: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
      description: "Task priority. Defaults to `low`.",
    },
    due_at: unixTimestamp("When the task is due."),
    labels: {
      type: "array",
      items: { type: "string" },
      description:
        "Labels attached to the task. Use ?label= on the list endpoint to filter. Defaults to [].",
    },
    created_at: unixTimestamp("When the task was created."),
    updated_at: unixTimestamp("When the task was last updated."),
  },
  required: [
    "id",
    "object",
    "organization_id",
    "name",
    "description",
    "priority",
    "due_at",
    "labels",
    "created_at",
    "updated_at",
  ],
};

const WebhookEndpoint: JSONSchema = {
  type: "object",
  description: "A webhook endpoint that captures inbound HTTP requests.",
  properties: {
    id: idField("whe", "webhook endpoint"),
    object: { type: "string", const: "webhook_endpoint" },
    organization_id: organizationId,
    name: { type: "string" },
    description: { type: ["string", "null"] },
    url: {
      type: "string",
      description: "Public capture URL (…/api/catch/{id}) that records requests.",
    },
    max_events: {
      type: "integer",
      description: "Maximum number of events retained. Defaults to 100.",
    },
    event_count: {
      type: "integer",
      description: "Number of captured events. Present on single-resource reads.",
    },
    created_at: unixTimestamp("When the endpoint was created."),
    updated_at: unixTimestamp("When the endpoint was last updated."),
  },
  required: [
    "id",
    "object",
    "organization_id",
    "name",
    "description",
    "url",
    "max_events",
    "created_at",
    "updated_at",
  ],
};

const WebhookEvent: JSONSchema = {
  type: "object",
  description: "A captured inbound HTTP request to a webhook endpoint.",
  properties: {
    id: idField("wev", "webhook event"),
    object: { type: "string", const: "webhook_event" },
    endpoint_id: { type: "string", description: "ID of the capturing endpoint (whe_…)." },
    organization_id: organizationId,
    method: { type: "string", description: "HTTP method of the captured request." },
    path: { type: "string" },
    headers: { type: "object", additionalProperties: { type: "string" } },
    body: { type: ["string", "null"], description: "Raw request body." },
    parsed_body: {
      description: "Parsed body when the payload was JSON, otherwise null.",
    },
    query_params: { type: "object", additionalProperties: { type: "string" } },
    source_ip: { type: ["string", "null"] },
    size_bytes: { type: ["integer", "null"] },
    received_at: unixTimestamp("When the request was captured."),
  },
  required: [
    "id",
    "object",
    "endpoint_id",
    "organization_id",
    "method",
    "path",
    "headers",
    "body",
    "parsed_body",
    "query_params",
    "source_ip",
    "size_bytes",
    "received_at",
  ],
};

const Artifact: JSONSchema = {
  type: "object",
  description: "An artifact — a file of content an agent can store and recall.",
  properties: {
    id: idField("art", "artifact"),
    object: { type: "string", const: "artifact" },
    organization_id: organizationId,
    name: { type: "string" },
    content: { type: "string", description: "The stored content." },
    format: {
      type: "string",
      enum: ["markdown", "html"],
      description:
        "Content format. Determines the content type the raw endpoint serves.",
    },
    raw_url: {
      type: "string",
      description:
        "Path serving the raw content with the format's content type (`text/html` for html, `text/markdown` for markdown).",
    },
    created_at: unixTimestamp("When the artifact was created."),
    updated_at: unixTimestamp("When the artifact was last updated."),
  },
  required: [
    "id",
    "object",
    "organization_id",
    "name",
    "content",
    "format",
    "raw_url",
    "created_at",
    "updated_at",
  ],
};

const ScheduledMessage: JSONSchema = {
  type: "object",
  description:
    "A message scheduled to fire at a later time to trigger an agent. Today the only channel is `http`: an HTTP request sent to `url` at `scheduled_at`.",
  properties: {
    id: idField("msg", "scheduled message"),
    object: { type: "string", const: "scheduled_message" },
    organization_id: organizationId,
    channel: {
      type: "string",
      enum: ["http"],
      description: "Delivery channel. Only `http` is supported today.",
    },
    url: { type: "string", description: "Target URL the request is sent to." },
    method: {
      type: "string",
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      description: "HTTP method used for delivery.",
    },
    headers: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Request headers. Defaults to {}.",
    },
    body: { type: ["string", "null"], description: "Request body, if any." },
    scheduled_at: unixTimestamp("When the message will fire."),
    status: {
      type: "string",
      enum: ["scheduled", "delivering", "delivered", "failed", "canceled"],
      description: "Delivery state.",
    },
    attempts: { type: "integer", description: "Number of delivery attempts made." },
    response_status: {
      type: ["integer", "null"],
      description: "HTTP status returned by the target on the last attempt.",
    },
    last_error: {
      type: ["string", "null"],
      description: "Error from the last attempt, if it failed.",
    },
    delivered_at: unixTimestamp("When the last delivery attempt ran."),
    created_at: unixTimestamp("When the message was created."),
    updated_at: unixTimestamp("When the message was last updated."),
  },
  required: [
    "id",
    "object",
    "organization_id",
    "channel",
    "url",
    "method",
    "headers",
    "body",
    "scheduled_at",
    "status",
    "attempts",
    "response_status",
    "last_error",
    "delivered_at",
    "created_at",
    "updated_at",
  ],
};

// Fields added to a create response when the resource is created anonymously
// (no API key). Returned exactly once so the resource can later be claimed.
const claimFields: JSONSchema = {
  claim_token: {
    type: "string",
    description:
      "One-time token to claim ownership of this resource via POST /api/claim/{id}. Only present when created without an API key.",
  },
  claim_url: { type: "string", description: "Relative URL for claiming the resource." },
};

// A create response is the resource plus the optional claim fields.
function withClaim(resourceRef: string): JSONSchema {
  return {
    allOf: [{ $ref: resourceRef }],
    properties: claimFields,
  };
}

// Generic list envelope (see listResponse in src/lib/api/response.ts).
function listOf(resourceRef: string, object: string): JSONSchema {
  return {
    type: "object",
    description: `A paginated list of ${object} objects.`,
    properties: {
      object: { type: "string", const: "list" },
      data: { type: "array", items: { $ref: resourceRef } },
      has_more: { type: "boolean" },
      next_cursor: {
        type: ["string", "null"],
        description: "ID to pass as ?after= for the next page, or null.",
      },
      total_count: { type: "integer" },
    },
    required: ["object", "data", "has_more", "next_cursor"],
  };
}

const Error: JSONSchema = {
  type: "object",
  description: "Standard error envelope returned for all 4xx/5xx responses.",
  properties: {
    error: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "invalid_request_error",
            "authentication_error",
            "authorization_error",
            "not_found_error",
            "rate_limit_error",
            "api_error",
          ],
        },
        code: { type: "string", description: "Machine-readable error code." },
        message: { type: "string", description: "Human-readable error message." },
        param: {
          type: ["string", "null"],
          description: "The offending parameter, when applicable.",
        },
      },
      required: ["type", "code", "message"],
    },
  },
  required: ["error"],
};

export const schemas: Record<string, JSONSchema> = {
  Task,
  WebhookEndpoint,
  WebhookEvent,
  Artifact,
  ScheduledMessage,
  TaskList: listOf("#/components/schemas/Task", "task"),
  WebhookEndpointList: listOf("#/components/schemas/WebhookEndpoint", "webhook endpoint"),
  WebhookEventList: listOf("#/components/schemas/WebhookEvent", "webhook event"),
  ArtifactList: listOf("#/components/schemas/Artifact", "artifact"),
  ScheduledMessageList: listOf("#/components/schemas/ScheduledMessage", "scheduled message"),
  TaskCreateResponse: withClaim("#/components/schemas/Task"),
  WebhookEndpointCreateResponse: withClaim("#/components/schemas/WebhookEndpoint"),
  ArtifactCreateResponse: withClaim("#/components/schemas/Artifact"),
  ScheduledMessageCreateResponse: withClaim("#/components/schemas/ScheduledMessage"),
  Error,
};

export const parameters: Record<string, JSONSchema> = {
  limit: {
    name: "limit",
    in: "query",
    description: "Number of results to return (1–100).",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  },
  after: {
    name: "after",
    in: "query",
    description: "Cursor for pagination — the ID of the last item from the previous page.",
    required: false,
    schema: { type: "string" },
  },
  label: {
    name: "label",
    in: "query",
    description:
      "Only return tasks carrying this label. May be repeated; a task must carry every requested label to match.",
    required: false,
    schema: { type: "string" },
  },
};

function errorResponse(description: string): JSONSchema {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}

export const responses: Record<string, JSONSchema> = {
  BadRequest: errorResponse("The request was malformed or failed validation."),
  Unauthorized: {
    ...errorResponse("No valid API key was provided."),
    headers: {
      "WWW-Authenticate": {
        description:
          "Advertises the protected-resource metadata URL (RFC 9728) so agents can bootstrap the agent-auth flow.",
        schema: { type: "string" },
      },
    },
  },
  Forbidden: errorResponse("The caller is authenticated but lacks access to the resource."),
  NotFound: errorResponse("The resource does not exist or is not visible to the caller."),
};

export const securitySchemes: Record<string, JSONSchema> = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    description:
      "Optional API key (e.g. `agt_live_…`) passed as `Authorization: Bearer <key>`. " +
      "Without a key, resources are created public and reachable by ID; with a key, they are owned by the key's organization.",
  },
};
