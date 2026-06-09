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
      identity_types_supported: ["anonymous", "identity_assertion"],
      anonymous: {
        credential_types_supported: ["api_key"],
      },
      identity_assertion: {
        assertion_types_supported: [
          "urn:ietf:params:oauth:token-type:id-jag",
          "verified_email",
        ],
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
- **User claimed (email required)** — the agent supplies a user email at
  registration; ${SERVICE_NAME} emails an OTP and issues no credential until the
  claim completes.

## Endpoints

- Protected Resource Metadata: \`${prmUrl()}\`
- Register: \`POST ${registerUri()}\` — dispatches on \`type\`
- Start claim: \`POST ${claimUri()}\` (anonymous start)
- Complete claim: \`POST ${claimUri()}/complete\`
- Revocation: \`POST ${revocationUri()}\` (\`application/logout+jwt\`)

## Scopes

- \`api.read\` — read tasks, subtasks, webhooks, and other resources.
- \`api.write\` — create and modify resources.

Anonymous (pre-claim) credentials receive \`api.read\` only; claimed and
agent-verified credentials receive \`api.read\` and \`api.write\`.

## Credentials

Credentials are issued as \`agt_live_*\` bearer keys, passed as
\`Authorization: Bearer <key>\`. \`access_token\` credentials expire; \`api_key\`
credentials do not. Access tokens issued from an ID-JAG carry no refresh token —
present a fresh ID-JAG to renew.

## Policies & contact

- Terms of service, pricing, and privacy policy: see the ${SERVICE_NAME} website.
- Integration issues: open an issue on the ${SERVICE_NAME} repository.
`;
}
