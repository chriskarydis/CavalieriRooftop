import "dotenv/config";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { stripeGateway } from "@/server/payments/gateway";

/**
 * Checks the Stripe keys in .env against Stripe itself, in test mode only:
 * creates a payment, pays it with Stripe's test card, refunds it in two
 * parts, and cancels a second unpaid payment. Moves no real money and refuses
 * to run with a live key.
 *
 *   npm run stripe:check
 */
async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) {
    console.error("STRIPE_SECRET_KEY must be a test key (sk_test_...). Nothing was done.");
    process.exit(1);
  }
  const gateway = stripeGateway();
  if (!gateway) throw new Error("Gateway not configured");
  const api = new Stripe(key);
  const reservationId = randomUUID();
  const step = (text: string) => console.log(`ok  ${text}`);

  const intent = await gateway.createPaymentIntent({
    amountCents: 17000,
    reservationId,
    reference: "CRG-CHECK",
    receiptEmail: "check@example.com",
  });
  step(`created payment ${intent.id} for 170.00 EUR`);

  const again = await gateway.createPaymentIntent({
    amountCents: 17000,
    reservationId,
    reference: "CRG-CHECK",
    receiptEmail: "check@example.com",
  });
  if (again.id !== intent.id) throw new Error("A repeated create made a second payment");
  step("a repeated create returned the same payment (idempotent)");

  if ((await gateway.getClientSecret(intent.id)) !== intent.clientSecret) throw new Error("Client secret mismatch");
  step("client secret can be fetched again for a returning guest");

  const paid = await api.paymentIntents.confirm(intent.id, {
    payment_method: "pm_card_visa",
  });
  if (paid.status !== "succeeded") throw new Error(`Payment status is ${paid.status}`);
  if (paid.metadata.reservationId !== reservationId) throw new Error("Metadata was not stored");
  step("paid with Stripe's test Visa; metadata carries the reservation id");

  const first = await gateway.refund({ paymentIntentId: intent.id, amountCents: 6000, idempotencyKey: `check:${reservationId}:1` });
  const repeat = await gateway.refund({ paymentIntentId: intent.id, amountCents: 6000, idempotencyKey: `check:${reservationId}:1` });
  if (first.id !== repeat.id) throw new Error("A repeated refund refunded twice");
  step(`partial refund of 60.00 (${first.status}); repeating it did not refund twice`);

  const rest = await gateway.refund({ paymentIntentId: intent.id, amountCents: 11000, idempotencyKey: `check:${reservationId}:2` });
  const after = await api.paymentIntents.retrieve(intent.id, { expand: ["latest_charge"] });
  const charge = after.latest_charge as Stripe.Charge;
  if (charge.amount_refunded !== 17000) throw new Error(`Refunded ${charge.amount_refunded}, expected 17000`);
  step(`refunded the remaining 110.00 (${rest.status}); Stripe shows 170.00 refunded in total`);

  const abandoned = await gateway.createPaymentIntent({
    amountCents: 6000,
    reservationId: randomUUID(),
    reference: "CRG-CHECK-2",
    receiptEmail: "check@example.com",
  });
  await gateway.cancelPaymentIntent(abandoned.id);
  await gateway.cancelPaymentIntent(abandoned.id);
  if ((await api.paymentIntents.retrieve(abandoned.id)).status !== "canceled") throw new Error("Payment was not cancelled");
  step("an unpaid payment was cancelled; cancelling it again is harmless");

  console.log("\nStripe test mode works with these keys.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
