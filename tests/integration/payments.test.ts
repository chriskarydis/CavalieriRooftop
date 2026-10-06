import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import { verifyWebhook, WebhookSignatureError, type PaymentGateway } from "@/server/payments/gateway";
import { attachGuestDetails, createHold, expireHolds, getAvailability } from "@/server/services/booking";
import { BookingError } from "@/server/services/context";
import { cancelReservation } from "@/server/services/floor-service";
import {
  alreadyProcessed,
  cancelAbandonedPayments,
  discretionaryRefund,
  getPaymentSummary,
  handlePaymentFailed,
  handlePaymentSucceeded,
  markProcessed,
  preparePayment,
  reconcilePayment,
  refundPayment,
} from "@/server/services/payments";
import { openTestDatabase, resetTestDatabase } from "./test-db";

const DATE = "2027-08-12";
const NOW = new Date("2027-08-01T10:00:00Z");

/** Stands in for Stripe and records what the application asked of it. */
function fakeGateway() {
  const calls = {
    intents: [] as Array<{ id: string; amountCents: number; reservationId: string; receiptEmail: string }>,
    refunds: [] as Array<{ paymentIntentId: string; amountCents: number; idempotencyKey: string }>,
    cancelled: [] as string[],
    /** Intents Stripe would report as paid. */
    paid: new Set<string>(),
  };
  const gateway: PaymentGateway = {
    async createPaymentIntent(input) {
      const id = `pi_test_${calls.intents.length + 1}`;
      calls.intents.push({ id, ...input });
      return { id, clientSecret: `${id}_secret` };
    },
    async getClientSecret(id) {
      return `${id}_secret`;
    },
    async isPaid(id) {
      return calls.paid.has(id);
    },
    async cancelPaymentIntent(id) {
      calls.cancelled.push(id);
    },
    async refund(input) {
      calls.refunds.push(input);
      return { id: `re_test_${calls.refunds.length}`, status: "SUCCEEDED" };
    },
  };
  return { gateway, calls };
}

describe("payments", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tableId: Map<number, string>;
  let stripe: ReturnType<typeof fakeGateway>;

  /** Holds premium table 1 for two guests (120 deposit + 50 fee) with guest details attached. */
  const heldWithDetails = async (table = 1) => {
    const held = await createHold(
      ctx.db,
      { date: DATE, time: "20:00", partySize: 2, selection: { mode: "TABLE", tableId: tableId.get(table)! }, locale: "en" },
      NOW,
    );
    await attachGuestDetails(ctx.db, held.reservationId, { name: "Test Guest", email: "guest@example.com" }, NOW);
    return held;
  };
  const paid = async (table = 1) => {
    const held = await heldWithDetails(table);
    await preparePayment(ctx.db, stripe.gateway, held.reservationId, NOW);
    await handlePaymentSucceeded(ctx.db, stripe.gateway, stripe.calls.intents.at(-1)!.id, NOW);
    return held;
  };
  const statusOf = async (reservationId: string) =>
    (await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.id, reservationId)))[0].status;

  beforeAll(async () => {
    ctx = await openTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(ctx.client);
    await seedInitialConfiguration(ctx.db);
    tableId = new Map((await ctx.db.select().from(schema.diningTable)).map((row) => [row.number, row.id]));
    stripe = fakeGateway();
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe("taking payment", () => {
    it("charges the server's price snapshot and sends Stripe no more than it needs", async () => {
      const held = await heldWithDetails();
      const { clientSecret } = await preparePayment(ctx.db, stripe.gateway, held.reservationId, NOW);
      expect(clientSecret).toBe("pi_test_1_secret");
      expect(stripe.calls.intents).toEqual([
        { id: "pi_test_1", amountCents: 17000, reservationId: held.reservationId, reference: held.reference, receiptEmail: "guest@example.com" },
      ]);
      expect(await getPaymentSummary(ctx.db, held.reservationId)).toEqual({
        status: "REQUIRES_PAYMENT",
        amountCents: 17000,
        refundedCents: 0,
      });
    });

    it("confirms when the guest returns and Stripe says the payment went through, before any webhook", async () => {
      const held = await heldWithDetails();
      await preparePayment(ctx.db, stripe.gateway, held.reservationId, NOW);

      // Not paid yet: nothing changes, whatever the browser claims.
      expect(await reconcilePayment(ctx.db, stripe.gateway, held.reservationId, NOW)).toBeNull();
      expect(await statusOf(held.reservationId)).toBe("PENDING_PAYMENT");

      stripe.calls.paid.add("pi_test_1");
      expect(await reconcilePayment(ctx.db, stripe.gateway, held.reservationId, NOW)).toEqual({
        kind: "CONFIRMED",
        reservationId: held.reservationId,
        firstTime: true,
      });
      expect(await statusOf(held.reservationId)).toBe("CONFIRMED");

      // The webhook arriving afterwards changes nothing and does not announce the reservation twice.
      expect(await handlePaymentSucceeded(ctx.db, stripe.gateway, "pi_test_1", NOW)).toEqual({
        kind: "CONFIRMED",
        reservationId: held.reservationId,
        firstTime: false,
      });
    });

    it("reuses the same payment when the guest reloads the page", async () => {
      const held = await heldWithDetails();
      await preparePayment(ctx.db, stripe.gateway, held.reservationId, NOW);
      await preparePayment(ctx.db, stripe.gateway, held.reservationId, NOW);
      expect(stripe.calls.intents).toHaveLength(1);
    });

    it("refuses to start payment without guest details or after the hold expired", async () => {
      const noDetails = await createHold(
        ctx.db,
        { date: DATE, time: "20:00", partySize: 2, selection: { mode: "TABLE", tableId: tableId.get(19)! }, locale: "en" },
        NOW,
      );
      await expect(preparePayment(ctx.db, stripe.gateway, noDetails.reservationId, NOW)).rejects.toMatchObject({
        code: "DETAILS_REQUIRED",
      });
      const held = await heldWithDetails();
      await expect(preparePayment(ctx.db, stripe.gateway, held.reservationId, addMinutes(NOW, 11))).rejects.toMatchObject({
        code: "HOLD_EXPIRED",
      });
      expect(stripe.calls.intents).toHaveLength(0);
    });

    it("the reservation stays unconfirmed until the provider reports success", async () => {
      const held = await heldWithDetails();
      await preparePayment(ctx.db, stripe.gateway, held.reservationId, NOW);
      expect(await statusOf(held.reservationId)).toBe("PENDING_PAYMENT");

      const outcome = await handlePaymentSucceeded(ctx.db, stripe.gateway, "pi_test_1", NOW);
      expect(outcome).toEqual({ kind: "CONFIRMED", reservationId: held.reservationId, firstTime: true });
      expect(await statusOf(held.reservationId)).toBe("CONFIRMED");
      expect((await getPaymentSummary(ctx.db, held.reservationId))?.status).toBe("SUCCEEDED");
    });

    it("a repeated success event changes nothing and refunds nothing", async () => {
      const held = await paid();
      const again = await handlePaymentSucceeded(ctx.db, stripe.gateway, "pi_test_1", NOW);
      expect(again).toEqual({ kind: "CONFIRMED", reservationId: held.reservationId, firstTime: false });
      expect(stripe.calls.refunds).toHaveLength(0);
    });

    it("ignores a success event for a payment it does not know", async () => {
      expect(await handlePaymentSucceeded(ctx.db, stripe.gateway, "pi_unknown", NOW)).toEqual({ kind: "UNKNOWN_PAYMENT" });
    });

    it("a failed payment leaves the hold in place so the guest can retry", async () => {
      const held = await heldWithDetails();
      await preparePayment(ctx.db, stripe.gateway, held.reservationId, NOW);
      await handlePaymentFailed(ctx.db, "pi_test_1", NOW);
      expect((await getPaymentSummary(ctx.db, held.reservationId))?.status).toBe("FAILED");
      expect(await statusOf(held.reservationId)).toBe("PENDING_PAYMENT");

      await handlePaymentSucceeded(ctx.db, stripe.gateway, "pi_test_1", NOW);
      expect(await statusOf(held.reservationId)).toBe("CONFIRMED");
    });
  });

  describe("payment after the hold expired", () => {
    it("is refunded in full when the table was released, and the table stays free", async () => {
      const held = await heldWithDetails();
      await preparePayment(ctx.db, stripe.gateway, held.reservationId, NOW);
      const late = addMinutes(NOW, 12);
      await expireHolds(ctx.db, late);

      const outcome = await handlePaymentSucceeded(ctx.db, stripe.gateway, "pi_test_1", late);
      expect(outcome).toEqual({ kind: "REFUNDED_HOLD_EXPIRED", reservationId: held.reservationId });
      expect(stripe.calls.refunds).toMatchObject([{ paymentIntentId: "pi_test_1", amountCents: 17000 }]);
      expect(await statusOf(held.reservationId)).toBe("EXPIRED");
      expect(await getPaymentSummary(ctx.db, held.reservationId)).toMatchObject({ status: "REFUNDED", refundedCents: 17000 });
      const availability = await getAvailability(ctx.db, { date: DATE, time: "20:00", partySize: 2 }, late);
      expect(availability.tables.find((table) => table.number === 1)?.state).toBe("AVAILABLE");

      // Stripe delivering the event again must not refund twice.
      await handlePaymentSucceeded(ctx.db, stripe.gateway, "pi_test_1", late);
      expect(stripe.calls.refunds).toHaveLength(1);
    });

    it("unpaid payments of expired holds are cancelled at the provider", async () => {
      const held = await heldWithDetails();
      await preparePayment(ctx.db, stripe.gateway, held.reservationId, NOW);
      const expired = await expireHolds(ctx.db, addMinutes(NOW, 12));
      expect(await cancelAbandonedPayments(ctx.db, stripe.gateway, expired)).toBe(1);
      expect(stripe.calls.cancelled).toEqual(["pi_test_1"]);
      expect((await getPaymentSummary(ctx.db, held.reservationId))?.status).toBe("CANCELLED");
    });
  });

  describe("refunds", () => {
    it("cancelling in time refunds deposit and table fee", async () => {
      const held = await paid();
      const { outcome } = await cancelReservation(ctx.db, held.reservationId, "guest", new Date("2027-08-10T10:00:00Z"));
      const result = await refundPayment(ctx.db, stripe.gateway, held.reservationId, {
        amountCents: outcome.refundCents,
        reason: "POLICY",
        initiatedBy: "guest",
      });
      expect(result).toEqual({ refundedCents: 17000, totalRefundedCents: 17000 });
      expect((await getPaymentSummary(ctx.db, held.reservationId))?.status).toBe("REFUNDED");
      const [row] = await ctx.db.select().from(schema.refund);
      expect(row).toMatchObject({ amountCents: 17000, reason: "POLICY", initiatedBy: "guest", status: "SUCCEEDED" });
    });

    it("cancelling late refunds nothing; a manager can then refund part or all, with a reason", async () => {
      const held = await paid();
      const { outcome } = await cancelReservation(ctx.db, held.reservationId, "guest", new Date("2027-08-12T10:00:00Z"));
      expect(outcome.refundCents).toBe(0);

      const first = await discretionaryRefund(ctx.db, stripe.gateway, held.reservationId, { amountCents: 6000, reason: "Guest was ill" }, "manager-1");
      expect(first).toEqual({ refundedCents: 6000, totalRefundedCents: 6000 });
      expect((await getPaymentSummary(ctx.db, held.reservationId))?.status).toBe("PARTIALLY_REFUNDED");

      // Asking for more than is left refunds only what is left.
      const second = await discretionaryRefund(ctx.db, stripe.gateway, held.reservationId, { amountCents: 99900, reason: "Rest of it" }, "manager-1");
      expect(second).toEqual({ refundedCents: 11000, totalRefundedCents: 17000 });
      expect(stripe.calls.refunds.map((refund) => refund.amountCents)).toEqual([6000, 11000]);
      expect(new Set(stripe.calls.refunds.map((refund) => refund.idempotencyKey)).size).toBe(2);

      await expect(
        discretionaryRefund(ctx.db, stripe.gateway, held.reservationId, { amountCents: 100, reason: "Again" }, "manager-1"),
      ).rejects.toBeInstanceOf(BookingError);

      const audits = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "payment.refunded"));
      expect(audits).toHaveLength(2);
      expect(audits[0]).toMatchObject({ actor: "manager-1", after: { reason: "Manager refund: Guest was ill" } });
    });

    it("a manager refund needs a reason, a positive amount and a reservation that did not take place", async () => {
      const held = await paid();
      const attempt = (amountCents: number, reason: string) =>
        discretionaryRefund(ctx.db, stripe.gateway, held.reservationId, { amountCents, reason }, "manager-1");
      // Still confirmed: use cancellation, not a discretionary refund.
      await expect(attempt(1000, "Because")).rejects.toBeInstanceOf(BookingError);
      await cancelReservation(ctx.db, held.reservationId, "guest", new Date("2027-08-12T10:00:00Z"));
      await expect(attempt(1000, "  ")).rejects.toBeInstanceOf(BookingError);
      await expect(attempt(0, "Because")).rejects.toBeInstanceOf(BookingError);
      await expect(attempt(-500, "Because")).rejects.toBeInstanceOf(BookingError);
      expect(stripe.calls.refunds).toHaveLength(0);
    });

    it("there is nothing to refund for a reservation that was never paid by card", async () => {
      const held = await heldWithDetails();
      expect(await refundPayment(ctx.db, stripe.gateway, held.reservationId, { amountCents: 5000, reason: "x", initiatedBy: "system" })).toBeNull();
    });
  });

  describe("webhook", () => {
    const secret = "whsec_test_secret";
    const payload = JSON.stringify({
      id: "evt_test_1",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test_1", object: "payment_intent" } },
    });

    it("accepts an event signed with the webhook secret", () => {
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
      expect(verifyWebhook(payload, signature, secret)).toEqual({
        id: "evt_test_1",
        type: "payment_intent.succeeded",
        paymentIntentId: "pi_test_1",
      });
    });

    it("rejects a missing, wrong or tampered signature", () => {
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
      expect(() => verifyWebhook(payload, null, secret)).toThrow(WebhookSignatureError);
      expect(() => verifyWebhook(payload, signature, "whsec_other")).toThrow(WebhookSignatureError);
      expect(() => verifyWebhook(payload.replace("pi_test_1", "pi_test_2"), signature, secret)).toThrow(WebhookSignatureError);
    });

    it("remembers processed events", async () => {
      expect(await alreadyProcessed(ctx.db, "evt_test_1")).toBe(false);
      await markProcessed(ctx.db, "evt_test_1", "payment_intent.succeeded");
      await markProcessed(ctx.db, "evt_test_1", "payment_intent.succeeded");
      expect(await alreadyProcessed(ctx.db, "evt_test_1")).toBe(true);
    });
  });
});
