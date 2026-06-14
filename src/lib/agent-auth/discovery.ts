import {
  SCOPES_SUPPORTED,
  resourceUrl,
  authServerUrl,
  registerUri,
  claimUri,
  revocationUri,
  prmUrl,
} from "./config";

const SERVICE_NAME = "agtls";
const REVOKED_EVENT =
  "https://schemas.workos.com/events/agent/auth/identity/assertion/revoked";

/** Origin without trailing slash, e.g. `https://agtls.dev`. */
function origin(): string {
  return resourceUrl().replace(/\/$/, "");
}

// API Catalog (RFC 9727) — a Linkset (RFC 9264) advertising the APIs agtls
// exposes. Each API is an `item` of the catalog; per-API context objects then
// carry `service-desc` (machine-readable definition), `service-doc` (human
// docs), and `service-meta` (auth metadata) links.
export function apiCatalogLinkset() {
  const base = origin();
  const catalogUrl = `${base}/.well-known/api-catalog`;
  const restApi = `${base}/api`;
  const mcpApi = `${base}/api/mcp`;

  return {
    linkset: [
      {
        anchor: catalogUrl,
        item: [
          { href: restApi, title: `${SERVICE_NAME} REST API` },
          { href: mcpApi, title: `${SERVICE_NAME} MCP server` },
        ],
      },
      {
        anchor: restApi,
        "service-desc": [
          {
            href: `${base}/api/openapi.json`,
            type: "application/openapi+json",
            title: "OpenAPI 3.1 definition",
          },
        ],
        "service-doc": [
          { href: `${base}/docs/api`, type: "text/html", title: "REST API docs" },
        ],
        "service-meta": [
          {
            href: prmUrl(),
            type: "application/json",
            title: "Protected Resource Metadata (RFC 9728)",
          },
        ],
      },
      {
        anchor: mcpApi,
        "service-doc": [
          { href: `${base}/docs/mcp`, type: "text/html", title: "MCP docs" },
        ],
        "service-meta": [
          {
            href: prmUrl(),
            type: "application/json",
            title: "Protected Resource Metadata (RFC 9728)",
          },
        ],
      },
    ],
  };
}

// Protected Resource Metadata (RFC 9728) — the machine-readable source of truth
// that advertises the resource and points at the authorization server.
export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    resource_name: SERVICE_NAME,
    authorization_servers: [authServerUrl()],
    scopes_supported: [...SCOPES_SUPPORTED],
    bearer_methods_supported: ["header"],
  };
}

// Authorization Server metadata — carries the agent_auth block describing the
// flows agtls actually accepts.
export function authorizationServerMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [authServerUrl()],
    scopes_supported: [...SCOPES_SUPPORTED],
    bearer_methods_supported: ["header"],
    agent_auth: {
      skill: "https://workos.com/auth.md",
      register_uri: registerUri(),
      claim_uri: claimUri(),
      revocation_uri: revocationUri(),
      identity_types_supported: [
        "anonymous",
        "identity_assertion",
        "service_auth",
      ],
      anonymous: {
        credential_types_supported: ["api_key"],
      },
      identity_assertion: {
        assertion_types_supported: [
          "urn:ietf:params:oauth:token-type:id-jag",
        ],
        credential_types_supported: ["access_token", "api_key"],
      },
      service_auth: {
        credential_types_supported: ["access_token", "api_key"],
      },
      events_supported: [REVOKED_EVENT],
    },
  };
}

// Prose discovery doc — the human/LLM-friendly companion to the PRM. Written as
// a step-by-step runbook an agent can follow end to end.
export function authMarkdown(): string {
  const base = origin();
  const prmDoc = prmUrl();
  const asDoc = `${base}/.well-known/oauth-authorization-server`;
  return `# ${SERVICE_NAME} — Agent Registration

You are an agent. ${SERVICE_NAME} is free, open infrastructure for AI agents —
task lists, inbound webhook catchers, and durable shared state, exposed over
REST and MCP. This document tells you how to get a credential and authenticate,
on your own or on behalf of a user.

**Canonical URL:** \`${base}/auth.md\`

No human is required to start: you can issue your own credential, work
immediately, and attach the work to a human's account later.

## Step 1 — Discover

Discovery uses OAuth Protected Resource Metadata (RFC 9728) and Authorization
Server Metadata. Fetch the protected resource metadata first:

\`\`\`http
GET ${prmDoc}
\`\`\`

\`\`\`json
{
  "resource": "${resourceUrl()}",
  "resource_name": "${SERVICE_NAME}",
  "authorization_servers": ["${authServerUrl()}"],
  "scopes_supported": ["api.read", "api.write"],
  "bearer_methods_supported": ["header"]
}
\`\`\`

Then fetch the authorization server metadata for the \`agent_auth\` block that
describes the flows ${SERVICE_NAME} accepts and the exact endpoint URLs:

\`\`\`http
GET ${asDoc}
\`\`\`

${SERVICE_NAME} is both the resource server and the authorization server, so all
URLs share the \`${base}\` origin.

## Step 2 — Pick a method

Choose the first that applies:

1. **\`identity_assertion\` (ID-JAG)** — you run on a trusted agent platform and
   can mint an [ID-JAG](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-identity-assertion-authz-grant)
   for this user. ${SERVICE_NAME} verifies it and returns a full-scope credential
   synchronously. No email round-trip.
2. **\`service_auth\`** — you know the user's email but have no assertion.
   ${SERVICE_NAME} emails the user an OTP and issues the credential only after
   the claim completes.
3. **\`anonymous\`** — no user identity. You get a read-only credential
   immediately and bind it to a user later (Step 4).

Before sending any user identity, show the user the service name
(\`${SERVICE_NAME}\`) and the scopes you will receive.

## Step 3 — Register

All three methods POST to the same endpoint; ${SERVICE_NAME} dispatches on
\`type\`. Responses are \`201\`. Errors use a flat
\`{ "error": "<code>", "message": "..." }\` envelope (Step 6).

### Anonymous

\`\`\`http
POST ${registerUri()}
Content-Type: application/json

{ "type": "anonymous" }
\`\`\`

\`\`\`json
{
  "registration_id": "...",
  "registration_type": "anonymous",
  "credential_type": "api_key",
  "credential": "agt_...",
  "credential_expires": null,
  "scopes": ["api.read"],
  "claim_url": "${claimUri()}",
  "claim_token": "clm_...",
  "claim_token_expires": "2026-06-21T00:00:00.000Z",
  "claim_link": "${base}/agent/link/...",
  "post_claim_scopes": ["api.read", "api.write"]
}
\`\`\`

Use \`credential\` immediately (Step 5) — it is shown once. Pre-claim keys are
read-only. Save \`claim_token\` (your secret for the OTP ceremony) and
\`claim_link\` (hand straight to your human for an in-browser claim). Anonymous
registration only supports \`api_key\`.

### Service auth (email)

\`\`\`http
POST ${registerUri()}
Content-Type: application/json

{ "type": "service_auth", "login_hint": "user@example.com" }
\`\`\`

\`\`\`json
{
  "registration_id": "...",
  "registration_type": "service_auth",
  "claim_url": "${claimUri()}",
  "claim_token": "clm_...",
  "claim_token_expires": "2026-06-21T00:00:00.000Z",
  "post_claim_scopes": ["api.read", "api.write"]
}
\`\`\`

${SERVICE_NAME} emails the user a claim link. No credential is issued yet — keep
\`claim_token\` in memory and go to Step 4. Add
\`"requested_credential_type": "access_token"\` if you want an expiring token
instead of an \`api_key\`.

### ID-JAG

Mint the assertion with \`aud\` = \`${resourceUrl()}\`, your provider issuer as
\`iss\`, \`email_verified: true\`, a fresh \`jti\`, and a near-term \`exp\`.

\`\`\`http
POST ${registerUri()}
Content-Type: application/json

{
  "type": "identity_assertion",
  "assertion_type": "urn:ietf:params:oauth:token-type:id-jag",
  "assertion": "<ID-JAG JWT>",
  "requested_credential_type": "access_token"
}
\`\`\`

\`\`\`json
{
  "registration_id": "...",
  "registration_type": "agent-provider",
  "credential_type": "access_token",
  "credential": "agt_...",
  "credential_expires": "2026-06-14T01:00:00.000Z",
  "scopes": ["api.read", "api.write"]
}
\`\`\`

Use the credential immediately. \`access_token\` credentials carry no refresh
token — present a fresh ID-JAG to renew. Your issuer must be on
${SERVICE_NAME}'s trusted list; if it is not, fall back to \`service_auth\` or
\`anonymous\`.

## Step 4 — Claim ceremony (bind to a user)

Skip this for ID-JAG (already bound). For \`anonymous\`, trigger the email:

\`\`\`http
POST ${claimUri()}
Content-Type: application/json

{ "claim_token": "clm_...", "email": "user@example.com" }
\`\`\`

\`\`\`json
{
  "registration_id": "...",
  "claim_attempt_id": "...",
  "status": "initiated",
  "expires_at": "2026-06-21T00:00:00.000Z"
}
\`\`\`

(For \`service_auth\` the email was already sent at registration — go straight to
the OTP submit below.) Tell the user: "Check your email, open the link, and read
me the 6-digit code." Then submit it:

\`\`\`http
POST ${claimUri()}/complete
Content-Type: application/json

{ "claim_token": "clm_...", "otp": "123456" }
\`\`\`

For an anonymous registration the existing key keeps working, upgraded to
\`["api.read", "api.write"]\` in place:

\`\`\`json
{ "registration_id": "...", "status": "claimed" }
\`\`\`

For \`service_auth\` the credential is issued now:

\`\`\`json
{
  "registration_id": "...",
  "status": "claimed",
  "credential_type": "api_key",
  "credential": "agt_...",
  "credential_expires": null,
  "scopes": ["api.read", "api.write"]
}
\`\`\`

If the email matches an existing ${SERVICE_NAME} account, you join that user's
organization as a member and share their resources. **Alternative (no OTP):** for
anonymous registrations, hand the \`claim_link\` from Step 3 to your human — they
open it, sign in, and claim you in-session.

## Step 5 — Use the credential

Send the credential as a bearer token on every request:

\`\`\`http
GET ${base}/api/tasks
Authorization: Bearer agt_...
\`\`\`

- REST base: \`${base}/api\` — JSON in/out, errors in a
  \`{ "error": { "type", "code", "message" } }\` envelope.
- MCP: connect to \`${base}/api/mcp\` (streamable HTTP) with the same
  \`Authorization: Bearer\` header. You can also register entirely over MCP via
  the \`agent_register\` tool.
- Agent skill (full runbook for using the API): \`${base}/skill.md\`

\`api_key\` credentials do not expire; \`access_token\` credentials do. If a
previously working credential returns \`401\`, discard it and restart from
Step 1.

## Step 6 — Errors

Agent-auth endpoints return \`{ "error": "<code>", "message": "..." }\`.

| Code | Where | What to do |
| --- | --- | --- |
| \`invalid_request\` | any | Fix the request body and retry. |
| \`unsupported_type\` | register | Use a supported \`type\` / \`assertion_type\`. |
| \`unsupported_credential_type\` | register | Anonymous supports only \`api_key\`; re-request. |
| \`invalid_login_hint\` | \`service_auth\` | Send a valid email as \`login_hint\`. |
| \`service_auth_not_enabled\` | \`service_auth\` | Use \`anonymous\` or \`identity_assertion\`. |
| \`invalid_issuer\` | ID-JAG | Your issuer is not trusted; use \`service_auth\` / \`anonymous\`. |
| \`invalid_signature\` | ID-JAG | Mint a fresh, correctly signed ID-JAG. |
| \`invalid_audience\` | ID-JAG | Mint with \`aud\` = \`${resourceUrl()}\`. |
| \`expired\` | ID-JAG | Mint a fresh assertion. |
| \`replay_detected\` | ID-JAG | Mint a fresh assertion with a new \`jti\`. |
| \`missing_verified_email\` | ID-JAG | Include \`email\` + \`email_verified: true\`. |
| \`invalid_claim_token\` | claim | Unknown token; restart registration. |
| \`claimed_or_in_flight\` | claim | Already claimed or a claim is pending. |
| \`previously_claimed\` | claim complete | Restart if you need a fresh credential. |
| \`claim_expired\` | claim | The window elapsed; restart registration. |
| \`otp_invalid\` | claim complete | Ask the user to re-read the code. |
| \`otp_expired\` | claim complete | Re-open the claim link to mint a new code. |
| \`rate_limited\` | any | Back off and retry later. |
| \`server_error\` | any | Retry with exponential backoff. |

Retry \`5xx\` with exponential backoff. Do not retry the same \`4xx\` payload
unless the table says to.

## Revocation

Agents do not initiate revocation. If a credential stops working (\`401\`),
discard it and restart from Step 1. Provider-driven revocation for ID-JAG flows
posts a signed logout token here:

\`\`\`http
POST ${revocationUri()}
Content-Type: application/logout+jwt
\`\`\`

## Policies & contact

- Terms of service, pricing, and privacy policy: see the ${SERVICE_NAME} website.
- Integration issues: open an issue on the ${SERVICE_NAME} repository.
`;
}

// Agent skill — a self-contained prompt an agent (or its operator) can load to
// authenticate and use agtls end-to-end with no human in the loop. Linked from
// the human sign-up page and served at /skill.md.
export function agentSkillMarkdown(): string {
  const base = registerUri().replace(/\/api\/agent\/auth$/, "");
  return `---
name: ${SERVICE_NAME}
description: Authenticate with ${SERVICE_NAME} on your own and use its agent infrastructure (tasks, webhook catchers) over REST or MCP. Use when you need a task list, an inbound webhook URL, or durable shared state without provisioning a backend.
---

# Using ${SERVICE_NAME} as an agent

${SERVICE_NAME} (${base}) is open-source infrastructure for AI agents. You do
not need a human to sign up: you can issue your own credential, work
immediately, and attach your work to a human's account later.

## 1. Get a credential (no human needed)

\`\`\`
POST ${registerUri()}
Content-Type: application/json

{"type": "anonymous"}
\`\`\`

The response contains:
- \`credential\` — an \`agt_*\` API key. Save it; it is shown once. Send it
  as \`Authorization: Bearer <credential>\` on every request.
- \`claim_token\` — save this too. A human uses it later to take ownership of
  your registration (see §4).

Pre-claim keys are read-only (\`api.read\`). If you need write access from the
start, either complete the claim (§4) or — when you know your user's email —
register with \`{"type": "service_auth", "login_hint": "<user email>"}\`
instead: the user receives an email, reads a one-time code back to you, and you
get a full-scope key bound to their account. Agents on trusted platforms can
present an ID-JAG (\`{"type": "identity_assertion", "assertion_type":
"urn:ietf:params:oauth:token-type:id-jag", "assertion": "<jwt>"}\`) and get a
full-scope credential synchronously. Full protocol details: ${base}/auth.md

## 2. Use the API

REST base: \`${base}/api\` — JSON in/out, errors in a
\`{"error": {"type", "code", "message"}}\` envelope.

- \`POST /api/tasks\` \`{"name": "...", "priority": "high", "labels": ["sprint-1"]}\` — create a task
- \`GET /api/tasks?label=sprint-1\` — list tasks filtered by label
- \`PATCH /api/tasks/{id}\` \`{"priority": "critical", "due_at": 1750000000}\` — update a task
- \`POST /api/webhooks\` \`{"name": "..."}\` — get a URL that captures anything
  POSTed to it; read events back at \`GET /api/webhooks/{id}/events\`

MCP: connect to \`${base}/api/mcp\` (streamable HTTP) with the same
\`Authorization: Bearer\` header. The same operations are exposed as tools. You
can also register entirely over MCP — call the \`agent_register\` tool (no
header needed) to get your \`credential\`, then pass it as the \`api_key\`
argument on every other tool call so your work is saved to your account.

## 3. Working without any credential

All write endpoints also work unauthenticated. Resources you create that way
are public (anyone with the ID can read/write them) and the creation response
includes a one-time \`claim_token\` for that resource. Later, any authenticated
caller can take ownership with:

\`\`\`
POST ${base}/api/claim/{resource_id}
Authorization: Bearer <any agt_* key>

{"claim_token": "clm_..."}
\`\`\`

## 4. Attaching your work to your human's account

When your operator wants your registration under their account, ask them for
their email, then:

\`\`\`
POST ${claimUri()}
{"claim_token": "<from registration>", "email": "<their email>"}
\`\`\`

They receive an email link showing a 6-digit code. Have them read it to you,
then:

\`\`\`
POST ${claimUri()}/complete
{"claim_token": "<same token>", "otp": "<code>"}
\`\`\`

Your existing key keeps working, upgraded to full scope. If their email matches
an existing ${SERVICE_NAME} account, you join their organization as a member —
you and your human share the same resources from then on, and they can see you
on their dashboard. Humans can also sign up at ${base}/sign-up and create keys
for you in their dashboard.
`;
}
