import "dotenv/config";
import { renderEmail, type EmailData, type EmailTemplate } from "@/server/email/templates";
import { sendEmail } from "@/server/email/transport";

/**
 * Sends sample emails through the configured provider, so the wording and the
 * delivery can be checked in a real inbox. Uses made-up reservation data.
 *
 *   npm run email:check -- you@example.com
 */
async function main(): Promise<void> {
  const recipient = process.argv[2] ?? process.env.RESTAURANT_NOTIFICATION_EMAIL;
  if (!recipient) {
    console.error("Usage: npm run email:check -- <address>");
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.error("RESEND_API_KEY and EMAIL_FROM must be set in .env. Nothing was sent.");
    process.exit(1);
  }

  const sample: EmailData = {
    locale: "en",
    reference: "CRG-SAMPLE",
    startsAt: new Date("2027-08-12T17:30:00Z"),
    timezone: "Europe/Athens",
    partySize: 2,
    tableNumbers: [1],
    tableCategoryName: "Premium",
    guestName: "Sample Guest",
    guestPhone: "+30 690 000 0000",
    depositCents: 12000,
    tableFeeCents: 5000,
    totalCents: 17000,
    creditTowardBillCents: 12000,
    graceMinutes: 15,
    refundCutoffHours: 24,
    manageToken: "sample-link-not-a-real-reservation",
    refundCents: 17000,
  };
  const samples: Array<[EmailTemplate, string]> = [
    ["guest_confirmation", "en"],
    ["guest_confirmation", "el"],
    ["guest_cancellation", "el"],
    ["restaurant_new", "en"],
  ];

  for (const [template, locale] of samples) {
    const email = renderEmail(template, { ...sample, locale });
    const result = await sendEmail({ to: recipient, ...email, subject: `[sample] ${email.subject}` });
    console.log(`ok  ${template} (${locale}) -> ${result.status} ${result.providerId ?? ""}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
