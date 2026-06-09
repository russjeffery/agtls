"use server";

import { generateOtpForView } from "@/lib/agent-auth/service";

export type RevealResult =
  | { ok: true; otp: string }
  | { ok: false };

// Server action invoked only when the user explicitly confirms (a POST). This
// is where the OTP is minted — never on the GET render — so link prefetchers
// can't consume or rotate the code.
export async function revealOtpAction(token: string): Promise<RevealResult> {
  const info = await generateOtpForView(token);
  if (!info) return { ok: false };
  return { ok: true, otp: info.otp };
}
