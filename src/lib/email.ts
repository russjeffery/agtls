// Pluggable email transport.
//
// Uses Resend when RESEND_API_KEY is set. Without it we fall back to logging —
// adequate for local development where the claim link / OTP can be copied
// straight from the server console.

import { Resend } from "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

type Sender = (msg: EmailMessage) => Promise<void>;

const FROM_ADDRESS = "noreply@agtls.dev";
const FROM_NAME = "Agent Tools";

const consoleSender: Sender = async (msg) => {
  // E2E hook: when AGTLS_TEST_EMAIL_FILE is set, append each message as JSON
  // so the browser tests can read back the claim link / OTP.
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
    `\n[email] (dev fallback — no RESEND_API_KEY)\n  to:      ${msg.to}\n  subject: ${msg.subject}\n  ${msg.text}\n`
  );
};

function makeResendSender(apiKey: string): Sender {
  const resend = new Resend(apiKey);
  return async (msg) => {
    const { error } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_ADDRESS}>`,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
  };
}

// Lazily initialised so the API key is read per-request (env vars are
// available at call time in both Next.js and Workers via process.env).
let cachedSender: Sender | null = null;

// A custom sender can be injected to override Resend (useful in tests).
let senderOverride: Sender | null = null;

export function setEmailSender(custom: Sender): void {
  senderOverride = custom;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  if (senderOverride) return senderOverride(msg);

  if (!cachedSender) {
    const key = process.env.RESEND_API_KEY;
    cachedSender = key ? makeResendSender(key) : consoleSender;
  }
  await cachedSender(msg);
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
