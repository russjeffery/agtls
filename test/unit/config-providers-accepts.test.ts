import { describe, it, expect, afterEach } from "vitest";
import {
  resourceUrl,
  authServerUrl,
  prmUrl,
  registerUri,
  claimUri,
  revocationUri,
  claimViewUrl,
  expectedAudience,
  SCOPES_SUPPORTED,
  PRE_CLAIM_SCOPES,
  POST_CLAIM_SCOPES,
  ACCESS_TOKEN_TTL_SECONDS,
  REGISTRATION_TTL_SECONDS,
  OTP_TTL_SECONDS,
  CLOCK_TOLERANCE_SECONDS,
} from "@/lib/agent-auth/config";
import {
  resolveProvider,
  jwksUriFor,
  _resetTrustListCache,
} from "@/lib/agent-auth/trusted-providers";
import { wantsHtml } from "@/lib/api/accepts";

// The harness sets NEXT_PUBLIC_APP_URL = "https://app.example.com".
const APP = "https://app.example.com";

// ─── config URL derivation ───────────────────────────────────────────────────

describe("agent-auth config", () => {
  it("derives discovery URLs from NEXT_PUBLIC_APP_URL", () => {
    expect(resourceUrl()).toBe(`${APP}/`);
    expect(authServerUrl()).toBe(`${APP}/`);
    expect(expectedAudience()).toBe(`${APP}/`);
    expect(prmUrl()).toBe(`${APP}/.well-known/oauth-protected-resource`);
    expect(registerUri()).toBe(`${APP}/api/agent/auth`);
    expect(claimUri()).toBe(`${APP}/api/agent/auth/claim`);
    expect(revocationUri()).toBe(`${APP}/api/agent/auth/revoke`);
    expect(claimViewUrl("cvt_abc")).toBe(`${APP}/agent/claim/cvt_abc`);
  });

  it("exposes the spec's scope sets and lifetimes", () => {
    expect(SCOPES_SUPPORTED).toEqual(["api.read", "api.write"]);
    expect(PRE_CLAIM_SCOPES).toEqual(["api.read"]);
    expect(POST_CLAIM_SCOPES).toEqual(["api.read", "api.write"]);
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(60 * 60);
    expect(REGISTRATION_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(OTP_TTL_SECONDS).toBe(10 * 60);
    expect(CLOCK_TOLERANCE_SECONDS).toBe(90);
  });
});

// ─── trusted providers ───────────────────────────────────────────────────────

describe("trusted-providers", () => {
  afterEach(() => {
    delete process.env.AGENT_AUTH_TRUSTED_PROVIDERS;
    _resetTrustListCache();
  });

  function setProviders(json: string) {
    process.env.AGENT_AUTH_TRUSTED_PROVIDERS = json;
    _resetTrustListCache();
  }

  it("resolves a configured issuer, ignoring a trailing slash", () => {
    setProviders(JSON.stringify([{ iss: "https://prov.example.com", name: "P" }]));
    expect(resolveProvider("https://prov.example.com")?.name).toBe("P");
    // Trailing slash is normalized on both sides.
    expect(resolveProvider("https://prov.example.com/")?.name).toBe("P");
  });

  it("defaults jwksUri to {iss}/.well-known/jwks.json and honors an override", () => {
    setProviders(
      JSON.stringify([
        { iss: "https://a.example.com" },
        { iss: "https://b.example.com", jwksUri: "https://b.example.com/keys" },
      ])
    );
    expect(jwksUriFor(resolveProvider("https://a.example.com")!)).toBe(
      "https://a.example.com/.well-known/jwks.json"
    );
    expect(jwksUriFor(resolveProvider("https://b.example.com")!)).toBe(
      "https://b.example.com/keys"
    );
  });

  it("treats an unset or invalid trust list as empty", () => {
    _resetTrustListCache();
    expect(resolveProvider("https://anything.example.com")).toBeUndefined();

    setProviders("{ not json");
    expect(resolveProvider("https://anything.example.com")).toBeUndefined();
  });
});

// ─── content negotiation ─────────────────────────────────────────────────────

describe("wantsHtml", () => {
  function req(accept?: string): Request {
    const headers = new Headers();
    if (accept !== undefined) headers.set("accept", accept);
    return new Request("https://app.example.com/api/tasks", { headers });
  }

  it("is true for browser Accept headers", () => {
    expect(wantsHtml(req("text/html,application/xhtml+xml,*/*"))).toBe(true);
  });

  it("is false for JSON or absent Accept", () => {
    expect(wantsHtml(req("application/json"))).toBe(false);
    expect(wantsHtml(req())).toBe(false);
    expect(wantsHtml(req(""))).toBe(false);
  });

  it("is false when Accept starts with application/json even if text/html appears later", () => {
    expect(wantsHtml(req("application/json, text/html"))).toBe(false);
  });
});
