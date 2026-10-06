import { db } from "@/server/db/client";
import { stripeGateway, verifyWebhook, WebhookSignatureError } from "@/server/payments/gateway";
import { notifyReservationEvent } from "@/server/services/notifications";
import { alreadyProcessed, handlePaymentFailed, handlePaymentSucceeded, markProcessed } from "@/server/services/payments";

/**
 * Stripe webhook: the authoritative source of payment results. The checkout
 * page may ask Stripe the same question first (reconcilePayment); both paths
 * run the same code and neither trusts the browser. An event is recorded as processed only
 * after it was handled, so a failure makes Stripe deliver it again.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const gateway = stripeGateway();
  if (!secret || !gateway) return new Response("Payments are not configured", { status: 503 });

  let event;
  try {
    event = verifyWebhook(await request.text(), request.headers.get("stripe-signature"), secret);
  } catch (error) {
    if (error instanceof WebhookSignatureError) return new Response("Invalid signature", { status: 400 });
    throw error;
  }
  if (await alreadyProcessed(db, event.id)) return Response.json({ received: true, duplicate: true });

  if (event.paymentIntentId && event.type === "payment_intent.succeeded") {
    const outcome = await handlePaymentSucceeded(db, gateway, event.paymentIntentId);
    if (outcome.kind === "CONFIRMED" && outcome.firstTime) {
      await notifyReservationEvent(db, outcome.reservationId, "CONFIRMED");
    }
  } else if (event.paymentIntentId && event.type === "payment_intent.payment_failed") {
    await handlePaymentFailed(db, event.paymentIntentId);
  }

  await markProcessed(db, event.id, event.type);
  return Response.json({ received: true });
}
