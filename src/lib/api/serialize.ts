import { toUnix } from "./response";

// Shared serializers — keeps route files thin

export function serializeTaskList(row: {
  id: string;
  projectId: string | null;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    object: "task_list" as const,
    project_id: row.projectId,
    name: row.name,
    description: row.description,
    created_at: toUnix(row.createdAt),
    updated_at: toUnix(row.updatedAt),
  };
}

export function serializeTask(row: {
  id: string;
  projectId: string | null;
  listId: string | null;
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
    object: "task" as const,
    project_id: row.projectId,
    list_id: row.listId,
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
    projectId: string | null;
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
    project_id: row.projectId,
    name: row.name,
    description: row.description,
    url: `${appUrl}/api/v1/catch/${row.id}`,
    max_events: row.maxEvents ?? 100,
    event_count: eventCount ?? undefined,
    created_at: toUnix(row.createdAt),
    updated_at: toUnix(row.updatedAt),
  };
}

export function serializeWebhookEvent(row: {
  id: string;
  endpointId: string;
  projectId: string | null;
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
    project_id: row.projectId,
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

export function serializeProject(row: {
  id: string;
  userId: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    object: "project" as const,
    name: row.name,
    slug: row.slug,
    created_at: toUnix(row.createdAt),
    updated_at: toUnix(row.updatedAt),
  };
}

export function serializeApiKey(row: {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  environment: "live" | "test";
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    object: "api_key" as const,
    project_id: row.projectId,
    name: row.name,
    // Show prefix + redacted suffix so users can identify the key
    key: `${row.keyPrefix}...`,
    environment: row.environment,
    last_used_at: toUnix(row.lastUsedAt),
    revoked_at: toUnix(row.revokedAt),
    created_at: toUnix(row.createdAt),
  };
}
