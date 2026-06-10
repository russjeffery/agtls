import { toUnix } from "./response";

// Shared serializers — keeps route files thin

export function serializeTask(row: {
  id: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    object: "task" as const,
    organization_id: row.organizationId,
    name: row.name,
    description: row.description,
    created_at: toUnix(row.createdAt),
    updated_at: toUnix(row.updatedAt),
  };
}

export function serializeSubtask(row: {
  id: string;
  organizationId: string | null;
  taskId: string | null;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  assignee: string | null;
  metadata: Record<string, unknown> | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    object: "subtask" as const,
    organization_id: row.organizationId,
    task_id: row.taskId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    metadata: row.metadata ?? {},
    due_at: toUnix(row.dueAt),
    completed_at: toUnix(row.completedAt),
    created_at: toUnix(row.createdAt),
    updated_at: toUnix(row.updatedAt),
  };
}

export function serializeWebhookEndpoint(
  row: {
    id: string;
    organizationId: string | null;
    name: string;
    description: string | null;
    maxEvents: number | null;
    createdAt: Date;
    updatedAt: Date;
  },
  eventCount?: number
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return {
    id: row.id,
    object: "webhook_endpoint" as const,
    organization_id: row.organizationId,
    name: row.name,
    description: row.description,
    url: `${appUrl}/api/catch/${row.id}`,
    max_events: row.maxEvents ?? 100,
    event_count: eventCount ?? undefined,
    created_at: toUnix(row.createdAt),
    updated_at: toUnix(row.updatedAt),
  };
}

export function serializeWebhookEvent(row: {
  id: string;
  endpointId: string;
  organizationId: string | null;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
  parsedBody: unknown;
  queryParams: Record<string, string>;
  sourceIp: string | null;
  sizeBytes: number | null;
  receivedAt: Date;
}) {
  return {
    id: row.id,
    object: "webhook_event" as const,
    endpoint_id: row.endpointId,
    organization_id: row.organizationId,
    method: row.method,
    path: row.path,
    headers: row.headers,
    body: row.body,
    parsed_body: row.parsedBody ?? null,
    query_params: row.queryParams,
    source_ip: row.sourceIp,
    size_bytes: row.sizeBytes,
    received_at: toUnix(row.receivedAt),
  };
}

export function serializeMemory(row: {
  id: string;
  organizationId: string | null;
  name: string;
  content: string;
  format: "markdown";
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    object: "memory" as const,
    organization_id: row.organizationId,
    name: row.name,
    content: row.content,
    format: row.format,
    created_at: toUnix(row.createdAt),
    updated_at: toUnix(row.updatedAt),
  };
}

export function serializeScheduledMessage(row: {
  id: string;
  organizationId: string | null;
  channel: "http";
  url: string;
  method: string;
  headers: Record<string, string> | null;
  body: string | null;
  scheduledAt: Date;
  status: "scheduled" | "delivering" | "delivered" | "failed" | "canceled";
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    object: "scheduled_message" as const,
    organization_id: row.organizationId,
    channel: row.channel,
    url: row.url,
    method: row.method,
    headers: row.headers ?? {},
    body: row.body,
    scheduled_at: toUnix(row.scheduledAt),
    status: row.status,
    attempts: row.attempts,
    response_status: row.responseStatus,
    last_error: row.lastError,
    delivered_at: toUnix(row.deliveredAt),
    created_at: toUnix(row.createdAt),
    updated_at: toUnix(row.updatedAt),
  };
}

export function serializeOrganization(row: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    object: "organization" as const,
    name: row.name,
    slug: row.slug,
    created_at: toUnix(row.createdAt),
  };
}

export function serializeApiKey(row: {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  scopes?: string[] | null;
  expiresAt?: Date | null;
  createdByAgent?: boolean;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    object: "api_key" as const,
    organization_id: row.organizationId,
    name: row.name,
    // Show prefix + redacted suffix so users can identify the key
    key: `${row.keyPrefix}...`,
    scopes: row.scopes ?? null,
    expires_at: toUnix(row.expiresAt ?? null),
    created_by_agent: row.createdByAgent ?? false,
    last_used_at: toUnix(row.lastUsedAt),
    revoked_at: toUnix(row.revokedAt),
    created_at: toUnix(row.createdAt),
  };
}
