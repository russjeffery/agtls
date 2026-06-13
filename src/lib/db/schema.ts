import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// D1 is SQLite, so rich Postgres types are encoded onto SQLite's storage
// classes: timestamps are integer epoch-milliseconds (mode "timestamp_ms"
// round-trips Date), booleans are 0/1 integers, JSON values are serialized
// into text (mode "json"), and enums are text columns constrained in app code
// via the exported *Values tuples (also the source for the zod schemas).

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const boolean = (name: string) => integer(name, { mode: "boolean" });

const createdNow = () =>
  timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date());
const updatedNow = () =>
  timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date());

// ─── BetterAuth required tables ──────────────────────────────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const session = sqliteTable("session", {
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
  // Required by the BetterAuth organization plugin.
  activeOrganizationId: text("active_organization_id"),
});

export const account = sqliteTable("account", {
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

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// ─── Organizations & API Keys ─────────────────────────────────────────────────
//
// Managed by the BetterAuth organization plugin. An organization is the
// ownership scope for resources and API keys; humans and agents are both
// `member` rows (agents are JIT-provisioned users), which is what lets a
// signed-in human see every agent with access to the same resources.
// Field shapes follow the plugin's expectations: `metadata` is a JSON string
// (not a JSON column), `invitation.expiresAt` is NOT NULL, and the invitation
// table must exist even though we add agent members programmatically.

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(), // newId, prefix "org_"
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: createdNow(),
});

export const member = sqliteTable("member", {
  id: text("id").primaryKey(), // newId, prefix "mem_"
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: createdNow(),
});

export const invitation = sqliteTable("invitation", {
  id: text("id").primaryKey(), // newId, prefix "inv_"
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: createdNow(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const apiKey = sqliteTable("api_key", {
  id: text("id").primaryKey(), // newId, prefix "key_"
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // First 20 chars shown in UI, e.g. "agt_abc123defghijklmn"
  keyPrefix: text("key_prefix").notNull(),
  // SHA-256 of the full key — never stored in plaintext after creation
  keyHash: text("key_hash").notNull().unique(),
  // Credentials issued from the agent-auth flow carry an explicit scope set
  // and (for access_token credentials) an expiry. Legacy keys leave both null,
  // which resolveAuth treats as "never expires / full access".
  scopes: text("scopes", { mode: "json" }).$type<string[]>(),
  expiresAt: timestamp("expires_at"),
  // Agent-auth linkage — lets us tag keys in events and find them on revoke.
  createdByAgent: boolean("created_by_agent").notNull().default(false),
  agentRegistrationId: text("agent_registration_id"),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: createdNow(),
});

// ─── Agent auth (auth.md) ─────────────────────────────────────────────────────
//
// One row per registration created through POST /agent/auth. Covers all three
// on-wire flows: agent-verified (ID-JAG), and the two user-claimed entrypoints
// (anonymous start, service_auth). See src/lib/agent-auth/ and auth.md.

export const agentRegistrationTypeValues = [
  "agent-provider", // agent-verified, via ID-JAG
  "anonymous", // user-claimed, anonymous start
  "service_auth", // user-claimed, agent supplies login_hint (email)
] as const;

export const agentRegistrationStatusValues = [
  "active", // agent-verified registration with a live credential
  "unclaimed", // user-claimed, awaiting OTP completion
  "claimed", // user-claimed, OTP completed and bound to a user
  "expired", // claim window elapsed before completion
  "revoked", // credential(s) invalidated (e.g. logout token)
] as const;

export const agentRegistration = sqliteTable("agent_registration", {
  id: text("id").primaryKey(), // newId, prefix "reg_"
  type: text("type", { enum: agentRegistrationTypeValues }).notNull(),
  status: text("status", { enum: agentRegistrationStatusValues }).notNull(),
  requestedCredentialType: text("requested_credential_type")
    .$type<"access_token" | "api_key">()
    .notNull(),
  // The principal that owns issued credentials. Created lazily for
  // service_auth (no principal until the claim completes).
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  apiKeyId: text("api_key_id"),
  // Scope sets. Pre-claim is what an anonymous credential gets up front.
  preClaimScopes: text("pre_claim_scopes", { mode: "json" }).$type<string[]>(),
  postClaimScopes: text("post_claim_scopes", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  // Identity. email is the asserted/claim email; iss/sub/aud come from ID-JAG
  // and are what revocation logout tokens key off of.
  email: text("email"),
  iss: text("iss"),
  sub: text("sub"),
  aud: text("aud"),
  // Provider correlation fields for ID-JAG flows.
  agentPlatform: text("agent_platform"),
  agentContextId: text("agent_context_id"),
  // Claim ceremony — store only SHA-256 hashes of the bearer secrets.
  claimAttemptId: text("claim_attempt_id"),
  claimTokenHash: text("claim_token_hash"),
  claimTokenExpiresAt: timestamp("claim_token_expires_at"),
  claimViewTokenHash: text("claim_view_token_hash"),
  otpHash: text("otp_hash"),
  otpExpiresAt: timestamp("otp_expires_at"),
  claimedByUserId: text("claimed_by_user_id"),
  claimedAt: timestamp("claimed_at"),
  // Audit trail.
  registrationIp: text("registration_ip"),
  createdAt: createdNow(),
  updatedAt: updatedNow(),
});

// Replay cache for ID-JAG and logout-token `jti` values. A shared store is
// required when /agent/auth runs across multiple replicas.
export const agentAssertionJti = sqliteTable("agent_assertion_jti", {
  jti: text("jti").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: createdNow(),
});

// Append-only audit log for agent-auth state transitions.
export const agentAuditEvent = sqliteTable("agent_audit_event", {
  id: text("id").primaryKey(), // newId, prefix "evt_"
  type: text("type").notNull(),
  registrationId: text("registration_id"),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: createdNow(),
});

// ─── Tasks ───────────────────────────────────────────────────────────────────
//
// Tasks are a flat collection — there is no parent/child hierarchy. Grouping
// and cross-cutting organization happen through `labels`, which the list API
// can filter on.

export const taskPriorityValues = ["low", "medium", "high", "critical"] as const;

export const task = sqliteTable("task", {
  id: text("id").primaryKey(), // newId, prefix "tsk_"
  // null = public / anonymous resource
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  description: text("description"),
  priority: text("priority", { enum: taskPriorityValues })
    .notNull()
    .default("low"),
  dueAt: timestamp("due_at"),
  labels: text("labels", { mode: "json" }).$type<string[]>(),
  // SHA-256 of the claim token issued on public creation; lets a later
  // authenticated caller take ownership via POST /api/claim/{id}. Cleared
  // once claimed. Null for resources created with auth.
  claimTokenHash: text("claim_token_hash"),
  createdAt: createdNow(),
  updatedAt: updatedNow(),
});

// ─── Webhook Endpoints & Events ───────────────────────────────────────────────

export const webhookEndpoint = sqliteTable("webhook_endpoint", {
  id: text("id").primaryKey(), // newId, prefix "wh_"
  // null = public / anonymous resource
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  description: text("description"),
  // Maximum number of events to retain (null = unlimited for authenticated)
  maxEvents: integer("max_events").default(100),
  // See task.claimTokenHash.
  claimTokenHash: text("claim_token_hash"),
  createdAt: createdNow(),
  updatedAt: updatedNow(),
});

export const webhookEvent = sqliteTable("webhook_event", {
  id: text("id").primaryKey(), // newId, prefix "whe_"
  endpointId: text("endpoint_id")
    .notNull()
    .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
  // Denormalized for fast queries without join
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  method: text("method").notNull(),
  path: text("path").notNull(),
  headers: text("headers", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull(),
  body: text("body"), // raw body string
  parsedBody: text("parsed_body", { mode: "json" }).$type<unknown>(), // JSON-parsed if applicable
  queryParams: text("query_params", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull(),
  sourceIp: text("source_ip"),
  sizeBytes: integer("size_bytes"),
  receivedAt: timestamp("received_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Agent Artifacts ──────────────────────────────────────────────────────────
//
// A simple store for an agent to persist a file of content (an artifact).
// Accepted formats are markdown and html; more (plain text, JSON, …) can be
// added later without reshaping the resource. GET /api/artifacts/{id}/raw
// serves the content with the format's content type.

export const artifactFormatValues = ["markdown", "html"] as const;

export const artifact = sqliteTable("artifact", {
  id: text("id").primaryKey(), // newId, prefix "art_"
  // null = public / anonymous resource
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  content: text("content").notNull(),
  format: text("format", { enum: artifactFormatValues })
    .notNull()
    .default("markdown"),
  // See task.claimTokenHash.
  claimTokenHash: text("claim_token_hash"),
  createdAt: createdNow(),
  updatedAt: updatedNow(),
});

// ─── Scheduled Messages ───────────────────────────────────────────────────────
//
// A message scheduled to fire at a later time to trigger an agent — a cron-style
// delayed dispatch. Today the only channel is `http` (send an HTTP request to a
// URL at `scheduledAt`); `channel` exists so other channels (email, SMS, …) can
// be added later. Delivery is performed by dispatchDueMessages() (see
// src/lib/messages/dispatch.ts), driven by the Worker cron trigger calling
// POST /api/messages/dispatch.

export const messageChannelValues = ["http"] as const;

export const messageStatusValues = [
  "scheduled", // waiting for its scheduled time
  "delivering", // claimed by a dispatcher, in flight (guards against double-send)
  "delivered", // sent and accepted by the target (2xx)
  "failed", // sent but the target errored, or the request threw
  "canceled", // canceled before it fired
] as const;

export const scheduledMessage = sqliteTable("scheduled_message", {
  id: text("id").primaryKey(), // newId, prefix "msg_"
  // null = public / anonymous resource
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  channel: text("channel", { enum: messageChannelValues })
    .notNull()
    .default("http"),
  // HTTP delivery target.
  url: text("url").notNull(),
  method: text("method").notNull().default("POST"),
  headers: text("headers", { mode: "json" }).$type<Record<string, string>>(),
  body: text("body"),
  // When the message should fire.
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status", { enum: messageStatusValues })
    .notNull()
    .default("scheduled"),
  attempts: integer("attempts").notNull().default(0),
  // Outcome of the most recent delivery attempt.
  responseStatus: integer("response_status"),
  lastError: text("last_error"),
  deliveredAt: timestamp("delivered_at"),
  // See task.claimTokenHash.
  claimTokenHash: text("claim_token_hash"),
  createdAt: createdNow(),
  updatedAt: updatedNow(),
});
