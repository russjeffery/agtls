import { setEmailSender, type EmailMessage } from "@/lib/email";

// Capture claim emails instead of logging them, so tests can pull the claim
// view token out of the link the user would have received.
const captured: EmailMessage[] = [];

setEmailSender(async (msg) => {
  captured.push(msg);
});

export function resetEmails(): void {
  captured.length = 0;
}

export function sentEmails(): readonly EmailMessage[] {
  return captured;
}

export function lastEmail(): EmailMessage | undefined {
  return captured[captured.length - 1];
}

/** Pull the `cvt_…` claim view token out of the most recent claim email. */
export function lastClaimViewToken(): string | null {
  const msg = lastEmail();
  if (!msg) return null;
  const match = msg.text.match(/\/agent\/claim\/(cvt_[A-Za-z0-9]+)/);
  return match ? match[1] : null;
}
