import { vi } from "vitest";
import { auth as betterAuth } from "@/lib/auth/server";

// Control BetterAuth session presence for the session-guarded routes (projects,
// keys) without standing up real cookies. Spies are cleared by the global
// beforeEach (vi.restoreAllMocks), so each test starts unauthenticated.

/** Make betterAuth.api.getSession resolve to a session for `userId`. */
export function mockSession(userId: string, email = "owner@example.com"): void {
  vi.spyOn(betterAuth.api, "getSession").mockResolvedValue({
    session: {
      id: "sess_test",
      userId,
      token: "tok_test",
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    },
    user: {
      id: userId,
      email,
      name: "Owner",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    // BetterAuth's return type is broad; the routes only read session.user.id.
  } as unknown as Awaited<ReturnType<typeof betterAuth.api.getSession>>);
}

/** Make getSession resolve to null (unauthenticated). */
export function mockNoSession(): void {
  vi.spyOn(betterAuth.api, "getSession").mockResolvedValue(null);
}
