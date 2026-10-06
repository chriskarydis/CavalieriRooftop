import { and, eq, inArray } from "drizzle-orm";
import type { PaymentGateway } from "@/server/payments/gateway";
import * as schema from "@/server/db/schema";
import { confirmReservation } from "./booking";
import { audit, BookingError, SYSTEM, type Actor, type Db } from "./context";

/**
 * Money movement for reservations. A reservation is confirmed only on the
 * payment provider's word: its webhook, or a direct question to it when the
 * guest returns before the webhook has arrived. Nothing the browser says is trusted.
 * Every function is safe to call twice with the same input.
 */

export type PaymentRow = typeof schema.payment.$inferSelect;

/**
 * Starts (or resumes) payment for a held reservation and returns the client
 * secret the browser needs to show the card form. The amount is the price
 * snapshot stored on the reservation; the browser never supplies it.
 */
export async function preparePayment(
  db: Db,
  gateway: PaymentGateway,
  reservationId: string,
  now = new Date(),
): Promise<{ clientSecret: string }> {
  const [row] = await db
    .select({ reservation: schema.reservation, customer: schema.customer })
    .from(schema.reservation)
    .leftJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
    .where(eq(schema.reservation.id, reservationId));
  if (!row) throw new BookingError("NOT_FOUND");
  const { reservation, customer } = row;
  if (!customer) throw new BookingError("DETAILS_REQUIRED");
  const holdActive =
    reservation.status === "PENDING_PAYMENT" &&
    reservation.holdExpiresAt !== null &&
    reservation.holdExpiresAt.getTime() > now.getTime();
  if (!holdActive) throw new BookingError("HOLD_EXPIRED");

  const [existing] = await db.select().from(schema.payment).where(eq(schema.payment.reservationId, reservationId));
  if (existing) return { clientSecret: await gateway.getClientSecret(existing.stripePaymentIntentId) };

  const intent = await gateway.createPaymentIntent({
    amountCents: reservation.totalCents,
    reservationId,
    reference: reservation.reference,
    receiptEmail: customer.email,
  });
  await db
    .insert(schema.payment)
    .values({
      reservationId,
      stripePaymentIntentId: intent.id,
      amountCents: reservation.totalCents,
      depositCents: reservation.depositCents,
      tableFeeCents: reservation.tableFeeCents,
      status: "REQUIRES_PAYMENT",
    })
    .onConflictDoNothing();
  return { clientSecret: intent.clientSecret };
}

export type PaymentOutcome =
  | { kind: "CONFIRMED"; reservationId: string; firstTime: boolean }
  /** The hold had lapsed and the table was gone, so the payment was refunded in full. */
  | { kind: "REFUNDED_HOLD_EXPIRED"; reservationId: string }
  | { kind: "UNKNOWN_PAYMENT" };

/** Handles the provider's "payment succeeded" event. */
export async function handlePaymentSucceeded(
  db: Db,
  gateway: PaymentGateway,
  paymentIntentId: string,
  now = new Date(),
): Promise<PaymentOutcome> {
  const [payment] = await db
    .select()
    .from(schema.payment)
    .where(eq(schema.payment.stripePaymentIntentId, paymentIntentId));
  if (!payment) return { kind: "UNKNOWN_PAYMENT" };
  const { reservationId } = payment;

  if (payment.status === "REQUIRES_PAYMENT" || payment.status === "FAILED") {
    await db.update(schema.payment).set({ status: "SUCCEEDED", updatedAt: now }).where(eq(schema.payment.id, payment.id));
  } else if (payment.status === "REFUNDED" || payment.status === "PARTIALLY_REFUNDED") {
    // Already processed, including the automatic refund below.
    const [reservation] = await db.select().from(schema.reservation).where(eq(schema.reservation.id, reservationId));
    return reservation?.status === "EXPIRED"
      ? { kind: "REFUNDED_HOLD_EXPIRED", reservationId }
      : { kind: "CONFIRMED", reservationId, firstTime: false };
  }

  const result = await confirmReservation(db, reservationId, SYSTEM, now);
  if (result.confirmed) return { kind: "CONFIRMED", reservationId, firstTime: !result.alreadyConfirmed };

  await refundPayment(db, gateway, reservationId, {
    amountCents: payment.amountCents,
    reason: "Hold expired before payment completed",
    initiatedBy: SYSTEM,
    now,
  });
  return { kind: "REFUNDED_HOLD_EXPIRED", reservationId };
}

/**
 * Asks the provider whether a reservation's payment went through and, if it
 * did, confirms exactly as the webhook would. Used when the guest comes back
 * from paying, so they are not left waiting if the webhook is slow or lost.
 * Returns null when there is nothing to do yet.
 */
export async function reconcilePayment(
  db: Db,
  gateway: PaymentGateway,
  reservationId: string,
  now = new Date(),
): Promise<PaymentOutcome | null> {
  const [payment] = await db.select().from(schema.payment).where(eq(schema.payment.reservationId, reservationId));
  if (!payment) return null;
  if (!(await gateway.isPaid(payment.stripePaymentIntentId))) return null;
  return handlePaymentSucceeded(db, gateway, payment.stripePaymentIntentId, now);
}

/** Handles the provider's "payment failed" event. The guest may try again while the hold lasts. */
export async function handlePaymentFailed(db: Db, paymentIntentId: string, now = new Date()): Promise<void> {
  await db
    .update(schema.payment)
    .set({ status: "FAILED", updatedAt: now })
    .where(and(eq(schema.payment.stripePaymentIntentId, paymentIntentId), eq(schema.payment.status, "REQUIRES_PAYMENT")));
}

export interface RefundResult {
  refundedCents: number;
  /** Total refunded on this payment so far. */
  totalRefundedCents: number;
}

/**
 * Refunds up to `amountCents` of a reservation's payment, never more than is
 * left on it. Returns null when there is no captured payment to refund.
 */
export async function refundPayment(
  db: Db,
  gateway: PaymentGateway,
  reservationId: string,
  input: { amountCents: number; reason: string; initiatedBy: Actor; now?: Date },
): Promise<RefundResult | null> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(schema.payment)
      .where(eq(schema.payment.reservationId, reservationId))
      .for("update");
    if (!payment || !["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status)) return null;

    const remaining = payment.amountCents - payment.refundedCents;
    const amountCents = Math.min(Math.max(0, Math.round(input.amountCents)), remaining);
    if (amountCents === 0) return { refundedCents: 0, totalRefundedCents: payment.refundedCents };

    const result = await gateway.refund({
      paymentIntentId: payment.stripePaymentIntentId,
      amountCents,
      // Same payment, same running total, same amount: a retry cannot refund twice.
      idempotencyKey: `refund:${payment.id}:${payment.refundedCents}:${amountCents}`,
    });
    await tx.insert(schema.refund).values({
      paymentId: payment.id,
      stripeRefundId: result.id,
      amountCents,
      status: result.status,
      reason: input.reason,
      initiatedBy: input.initiatedBy,
    });
    if (result.status === "FAILED") return { refundedCents: 0, totalRefundedCents: payment.refundedCents };

    const totalRefundedCents = payment.refundedCents + amountCents;
    await tx
      .update(schema.payment)
      .set({
        refundedCents: totalRefundedCents,
        status: totalRefundedCents >= payment.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED",
        updatedAt: now,
      })
      .where(eq(schema.payment.id, payment.id));
    await audit(tx, {
      actor: input.initiatedBy,
      action: "payment.refunded",
      entityType: "reservation",
      entityId: reservationId,
      before: { refundedCents: payment.refundedCents },
      after: { refundedCents: totalRefundedCents, amountCents, reason: input.reason },
    });
    return { refundedCents: amountCents, totalRefundedCents };
  });
}

/**
 * A manager's refund outside the cancellation policy (illness, restaurant
 * closed). Only for reservations that did not take place.
 */
export async function discretionaryRefund(
  db: Db,
  gateway: PaymentGateway,
  reservationId: string,
  input: { amountCents: number; reason: string },
  actor: Actor,
): Promise<RefundResult> {
  const reason = input.reason.trim();
  if (!reason || !Number.isFinite(input.amountCents) || input.amountCents <= 0) throw new BookingError("INVALID_SELECTION");
  const [reservation] = await db.select().from(schema.reservation).where(eq(schema.reservation.id, reservationId));
  if (!reservation) throw new BookingError("NOT_FOUND");
  if (reservation.status !== "CANCELLED" && reservation.status !== "NO_SHOW") throw new BookingError("INVALID_SELECTION");

  const result = await refundPayment(db, gateway, reservationId, {
    amountCents: input.amountCents,
    reason: `Manager refund: ${reason}`,
    initiatedBy: actor,
  });
  if (!result || result.refundedCents === 0) throw new BookingError("INVALID_SELECTION");
  return result;
}

/** Scheduled job: stop unpaid payments of expired holds from being completed later. */
export async function cancelAbandonedPayments(db: Db, gateway: PaymentGateway, reservationIds: string[], now = new Date()): Promise<number> {
  if (reservationIds.length === 0) return 0;
  const abandoned = await db
    .select()
    .from(schema.payment)
    .where(and(inArray(schema.payment.reservationId, reservationIds), inArray(schema.payment.status, ["REQUIRES_PAYMENT", "FAILED"])));
  for (const payment of abandoned) {
    await gateway.cancelPaymentIntent(payment.stripePaymentIntentId);
    await db.update(schema.payment).set({ status: "CANCELLED", updatedAt: now }).where(eq(schema.payment.id, payment.id));
  }
  return abandoned.length;
}

/** True the first time an event id is seen; the caller records it only after handling it. */
export async function alreadyProcessed(db: Db, eventId: string): Promise<boolean> {
  const [seen] = await db.select().from(schema.stripeEvent).where(eq(schema.stripeEvent.id, eventId));
  return Boolean(seen);
}

export async function markProcessed(db: Db, eventId: string, type: string): Promise<void> {
  await db.insert(schema.stripeEvent).values({ id: eventId, type }).onConflictDoNothing();
}

/** Payment state for the guest's and staff's screens. */
export async function getPaymentSummary(db: Db, reservationId: string): Promise<{ status: PaymentRow["status"]; amountCents: number; refundedCents: number } | null> {
  const [payment] = await db.select().from(schema.payment).where(eq(schema.payment.reservationId, reservationId));
  return payment ? { status: payment.status, amountCents: payment.amountCents, refundedCents: payment.refundedCents } : null;
}
