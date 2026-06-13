import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "../helpers/db";
import { agentAssertionJti, agentAuditEvent } from "@/lib/db/schema";
import { markJtiSeen } from "@/lib/agent-auth/replay";
import { recordAuditEvent } from "@/lib/agent-auth/audit";

// These exercise the small DB-backed helpers against the harness's in-memory SQLite.

describe("markJtiSeen", () => {
  const future = () => new Date(Date.now() + 60_000);

  it("returns true the first time a jti is seen and false on replay", async () => {
    expect(await markJtiSeen("jti-unique", future())).toBe(true);
    expect(await markJtiSeen("jti-unique", future())).toBe(false);

    // Row persisted exactly once.
    const rows = await testDb
      .select()
      .from(agentAssertionJti)
      .where(eq(agentAssertionJti.jti, "jti-unique"));
    expect(rows).toHaveLength(1);
  });

  it("treats distinct jtis independently", async () => {
    expect(await markJtiSeen("jti-a", future())).toBe(true);
    expect(await markJtiSeen("jti-b", future())).toBe(true);
  });
});

describe("recordAuditEvent", () => {
  it("appends an audit row with type, registrationId and data", async () => {
    await recordAuditEvent("registration.created", {
      registrationId: "reg_test123",
      data: { registration_type: "anonymous" },
    });

    const rows = await testDb
      .select()
      .from(agentAuditEvent)
      .where(eq(agentAuditEvent.registrationId, "reg_test123"));

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toMatch(/^evt_/);
    expect(rows[0].type).toBe("registration.created");
    expect(rows[0].data).toEqual({ registration_type: "anonymous" });
  });

  it("allows a null registrationId / data", async () => {
    await recordAuditEvent("registration.revoked");
    const rows = await testDb
      .select()
      .from(agentAuditEvent)
      .where(eq(agentAuditEvent.type, "registration.revoked"));
    expect(rows).toHaveLength(1);
    expect(rows[0].registrationId).toBeNull();
    expect(rows[0].data).toBeNull();
  });
});
