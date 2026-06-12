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

// Prose discovery doc — the human/LLM-friendly companion to the PRM.
export function authMarkdown(): string {
  return `# ${SERVICE_NAME}

Open-source infrastructure for AI agents. This document tells agents how to
register against ${SERVICE_NAME} and authenticate on behalf of a user.

## Flows supported

- **Agent verified** — a trusted agent provider asserts the user's identity
  with an [ID-JAG](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-identity-assertion-authz-grant).
  ${SERVICE_NAME} verifies the assertion and returns credentials synchronously.
- **User claimed (anonymous start)** — the agent self-registers without an
  identity and receives an \`api_key\` scoped to pre-claim permissions
  immediately, then runs the OTP claim later to bind it to a real user and
  upgrade scopes.
- **User claimed (service auth)** — the agent supplies a \`login_hint\` (the
  user's email) at registration; ${SERVICE_NAME} authenticates the user
  out-of-band, emails an OTP, and issues no credential until the claim completes.

## Endpoints

- Protected Resource Metadata: \`${prmUrl()}\`
- Register: \`POST ${registerUri()}\` — dispatches on \`type\`
- Start claim: \`POST ${claimUri()}\` (anonymous start)
- Complete claim: \`POST ${claimUri()}/complete\`
- Revocation: \`POST ${revocationUri()}\` (\`application/logout+jwt\`)

## Scopes

- \`api.read\` — read tasks, webhooks, and other resources.
- \`api.write\` — create and modify resources.

Anonymous (pre-claim) credentials receive \`api.read\` only; claimed and
agent-verified credentials receive \`api.read\` and \`api.write\`.

## Credentials

Credentials are issued as \`agt_*\` bearer keys, passed as
\`Authorization: Bearer <key>\`. \`access_token\` credentials expire; \`api_key\`
credentials do not. Access tokens issued from an ID-JAG carry no refresh token —
present a fresh ID-JAG to renew.

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
