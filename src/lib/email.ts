// Pluggable email transport.
//
// Production deployments should wire a real provider here (Resend, SES, SMTP,
// etc.). With no provider configured we fall back to logging the message —
// adequate for local development, where the claim link / OTP can be copied
// straight from the server console. The OTP ceremony logic is identical
// regardless of transport.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

type Sender = (msg: EmailMessage) => Promise<void>;

const consoleSender: Sender = async (msg) => {
  // E2E hook: when AGTLS_TEST_EMAIL_FILE is set, append each message as JSON
  // so the browser tests can read back the claim link / OTP. This is the same
  // module instance the app uses, so the capture is guaranteed to apply.
  const captureFile = process.env.AGTLS_TEST_EMAIL_FILE;
  if (captureFile) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(
      captureFile,
      JSON.stringify({ ...msg, at: Date.now() }) + "\n"
    );
    return;
  }
  console.log(
    `\n[email] (dev fallback — no provider configured)\n  to:      ${msg.to}\n  subject: ${msg.subject}\n  ${msg.text}\n`
  );
};

// A real sender can be injected by assigning to this binding at startup.
let sender: Sender = consoleSender;

export function setEmailSender(custom: Sender): void {
  sender = custom;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  await sender(msg);
}

/** Claim email: links the user to the server-rendered OTP page. */
export async function sendClaimEmail(
  to: string,
  viewUrl: string,
  serviceName: string
): Promise<void> {
  const subject = `Confirm agent access to ${serviceName}`;
  const text = [
    `An agent is requesting access to your ${serviceName} account.`,
    `If you recognize this request, open the link below to view a one-time code and read it back to the agent:`,
    ``,
    viewUrl,
    ``,
    `If you did not initiate this, you can safely ignore this email — no access is granted without the code.`,
  ].join("\n");
  await sendEmail({
    to,
    subject,
    text,
    html: `<p>An agent is requesting access to your <strong>${serviceName}</strong> account.</p>
<p>If you recognize this request, open the link below to view a one-time code and read it back to the agent:</p>
<p><a href="${viewUrl}">${viewUrl}</a></p>
<p>If you did not initiate this, you can safely ignore this email — no access is granted without the code.</p>`,
  });
}
