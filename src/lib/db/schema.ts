import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── BetterAuth required tables ──────────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// ─── Projects & API Keys ──────────────────────────────────────────────────────

export const project = pgTable("project", {
  id: text("id").primaryKey(), // nanoid, prefix: prj_
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const apiKeyEnvironment = pgEnum("api_key_environment", [
  "live",
  "test",
]);

export const apiKey = pgTable("api_key", {
  id: text("id").primaryKey(), // nanoid
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // First 20 chars shown in UI, e.g. "agt_live_abc123defgh"
  keyPrefix: text("key_prefix").notNull(),
  // SHA-256 of the full key — never stored in plaintext after creation
  keyHash: text("key_hash").notNull().unique(),
  environment: apiKeyEnvironment("environment").notNull().default("live"),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Tasks & Subtasks ────────────────────────────────────────────────────────

export const task = pgTable("task", {
  id: text("id").primaryKey(), // nanoid, prefix: tsk_
  // null = public / anonymous resource
  projectId: text("project_id").references(() => project.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const subtaskStatus = pgEnum("subtask_status", [
  "todo",
  "in_progress",
  "done",
  "cancelled",
]);

export const subtaskPriority = pgEnum("subtask_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const subtask = pgTable("subtask", {
  id: text("id").primaryKey(), // nanoid, prefix: sub_
  // null = public / anonymous resource
  projectId: text("project_id").references(() => project.id, {
    onDelete: "cascade",
  }),
  taskId: text("task_id").references(() => task.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  description: text("description"),
  status: subtaskStatus("status").notNull().default("todo"),
  priority: subtaskPriority("priority").notNull().default("medium"),
  assignee: text("assignee"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  dueAt: timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Webhook Endpoints & Events ───────────────────────────────────────────────

export const webhookEndpoint = pgTable("webhook_endpoint", {
  id: text("id").primaryKey(), // nanoid, prefix: whe_
  // null = public / anonymous resource
  projectId: text("project_id").references(() => project.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  description: text("description"),
  // Maximum number of events to retain (null = unlimited for authenticated)
  maxEvents: integer("max_events").default(100),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const webhookEvent = pgTable("webhook_event", {
  id: text("id").primaryKey(), // nanoid, prefix: wev_
  endpointId: text("endpoint_id")
    .notNull()
    .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
  // Denormalized for fast queries without join
  projectId: text("project_id").references(() => project.id, {
    onDelete: "cascade",
  }),
  method: text("method").notNull(),
  path: text("path").notNull(),
  headers: jsonb("headers").$type<Record<string, string>>().notNull(),
  body: text("body"), // raw body string
  parsedBody: jsonb("parsed_body").$type<unknown>(), // JSON-parsed if applicable
  queryParams: jsonb("query_params").$type<Record<string, string>>().notNull(),
  sourceIp: text("source_ip"),
  sizeBytes: integer("size_bytes"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});
