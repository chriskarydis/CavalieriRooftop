import Stripe from "stripe";

/**
 * The few things the application asks of the payment provider. Services take
 * this interface, so they can be tested without calling Stripe.
 */
export interface PaymentGateway {
  createPaymentIntent(input: {
    amountCents: number;
    reservationId: string;
    reference: string;
    receiptEmail: string;
  }): Promise<{ id: string; clientSecret: string }>;
  /** Client secret of an existing intent, so a returning guest can finish paying. */
  getClientSecret(paymentIntentId: string): Promise<string>;
  /** Whether Stripe itself reports the intent as paid. Asked server to server; the browser is not involved. */
  isPaid(paymentIntentId: string): Promise<boolean>;
  /** Stops an unpaid intent from being paid later. Safe to call on an already-cancelled intent. */
  cancelPaymentIntent(paymentIntentId: string): Promise<void>;
  refund(input: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ id: string; status: "PENDING" | "SUCCEEDED" | "FAILED" }>;
}

export interface PaymentEvent {
  id: string;
  type: string;
  /** Set for payment_intent.* events. */
  paymentIntentId: string | null;
}

let client: Stripe | null = null;

function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

/** True when both Stripe keys are configured and card payments can be taken. */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

const REFUND_STATUS: Record<string, "PENDING" | "SUCCEEDED" | "FAILED"> = {
  succeeded: "SUCCEEDED",
  pending: "PENDING",
  requires_action: "PENDING",
  failed: "FAILED",
  canceled: "FAILED",
};

/** The Stripe-backed gateway, or null when no secret key is configured. */
export function stripeGateway(): PaymentGateway | null {
  const api = stripe();
  if (!api) return null;

  return {
    async createPaymentIntent({ amountCents, reservationId, reference, receiptEmail }) {
      const intent = await api.paymentIntents.create(
        {
          amount: amountCents,
          currency: "eur",
          // Cards only (including Apple Pay and Google Pay, which are card wallets): they settle within
          // the 10-minute hold. Bank redirects and pay-later methods can take longer than the hold lasts.
          allowed_payment_method_types: ["card"],
          description: `Reservation ${reference}`,
          receipt_email: receiptEmail,
          // The reservation id is all Stripe needs to know; no guest details or manage token.
          metadata: { reservationId, reference },
        },
        { idempotencyKey: `intent:${reservationId}` },
      );
      if (!intent.client_secret) throw new Error("Stripe returned no client secret");
      return { id: intent.id, clientSecret: intent.client_secret };
    },

    async getClientSecret(paymentIntentId) {
      const intent = await api.paymentIntents.retrieve(paymentIntentId);
      if (!intent.client_secret) throw new Error("Stripe returned no client secret");
      return intent.client_secret;
    },

    async isPaid(paymentIntentId) {
      return (await api.paymentIntents.retrieve(paymentIntentId)).status === "succeeded";
    },

    async cancelPaymentIntent(paymentIntentId) {
      try {
        await api.paymentIntents.cancel(paymentIntentId);
      } catch (error) {
        // Already cancelled or already paid: nothing to stop. A paid intent is handled by the webhook.
        if (error instanceof Stripe.errors.StripeInvalidRequestError) return;
        throw error;
      }
    },

    async refund({ paymentIntentId, amountCents, idempotencyKey }) {
      const refund = await api.refunds.create({ payment_intent: paymentIntentId, amount: amountCents }, { idempotencyKey });
      return { id: refund.id, status: REFUND_STATUS[refund.status ?? "pending"] ?? "PENDING" };
    },
  };
}

export class WebhookSignatureError extends Error {
  constructor() {
    super("Invalid webhook signature");
    this.name = "WebhookSignatureError";
  }
}

/**
 * Verifies that a webhook really came from Stripe and returns the event.
 * Nothing in the request body is trusted before this check passes.
 */
export function verifyWebhook(rawBody: string, signature: string | null, secret: string): PaymentEvent {
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature ?? "", secret);
  } catch {
    throw new WebhookSignatureError();
  }
  const object = event.data.object as { object?: string; id?: string };
  return {
    id: event.id,
    type: event.type,
    paymentIntentId: object.object === "payment_intent" && object.id ? object.id : null,
  };
}
