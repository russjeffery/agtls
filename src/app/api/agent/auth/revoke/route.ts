import { NextRequest, NextResponse } from "next/server";
import { handleRevoke } from "@/lib/agent-auth/service";

// POST /agent/auth/revoke — back-channel revocation. The provider posts a
// signed logout+jwt referencing the delegation to revoke. The body is the raw
// JWT (Content-Type: application/logout+jwt), so we read it with text(), not
// json(). Returns 200 on success, 400 on any verification failure (per spec).
export async function POST(request: NextRequest) {
  try {
    const token = (await request.text()).trim();
    if (!token) {
      return NextResponse.json(
        { error: "invalid_request", message: "Missing logout token." },
        { status: 400 }
      );
    }
    await handleRevoke(token);
    return new NextResponse(null, { status: 200 });
  } catch {
    // Verification failures (and anything else) → 400, no internal detail.
    return NextResponse.json(
      { error: "invalid_token", message: "Logout token verification failed." },
      { status: 400 }
    );
  }
}
