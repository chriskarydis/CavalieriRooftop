/**
 * Sends one email. With RESEND_API_KEY set it goes through Resend; without it
 * (local development, tests) nothing leaves the machine and the message is
 * only recorded by the caller in `email_log`.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  /** SENT through the provider, or LOGGED when no provider is configured. */
  status: "SENT" | "LOGGED";
  providerId: string | null;
}

export type EmailTransport = (email: OutgoingEmail) => Promise<SendResult>;

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export const sendEmail: EmailTransport = async (email) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "test") console.info(`[email not sent: no provider configured] ${email.subject}`);
    return { status: "LOGGED", providerId: null };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
  });
  if (!response.ok) throw new Error(`Email provider answered ${response.status}`);
  const body = (await response.json()) as { id?: string };
  return { status: "SENT", providerId: body.id ?? null };
};
