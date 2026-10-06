import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import { stripeGateway, type PaymentGateway } from "@/server/payments/gateway";
import { attachGuestDetails, createHold, expireHolds, getAvailability } from "@/server/services/booking";
import { cancelReservation } from "@/server/services/floor-service";
import { discretionaryRefund, getPaymentSummary, handlePaymentSucceeded, preparePayment } from "@/server/services/payments";
import { openTestDatabase, resetTestDatabase } from "../integration/test-db";

/**
 * Money paths that the browser suite cannot reach, run against Stripe itself
 * in TEST mode: the automatic refund of a payment that lands after its hold
 * was released, and a manager's discretionary refund. Run with
 *   npm run test:stripe:services
 */

const DATE = "2027-08-12";
const NOW = new Date("2027-08-01T10:00:00Z");
const STRIPE_TIMEOUT = 60_000;

describe("refunds against Stripe test mode", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tableId: Map<number, string>;
  let gateway: PaymentGateway;
  let api: Stripe;

  /** Holds premium table 1 for two (170.00), attaches details and starts the payment at Stripe. */
  const startPayment = async () => {
    const held = await createHold(
      ctx.db,
      { date: DATE, time: "20:00", partySize: 2, selection: { mode: "TABLE", tableId: tableId.get(1)! }, locale: "en" },
      NOW,
    );
    await attachGuestDetails(ctx.db, held.reservationId, { name: "Test Guest", email: "guest@example.com" }, NOW);
    await preparePayment(ctx.db, gateway, held.reservationId, NOW);
    const [payment] = await ctx.db.select().from(schema.payment);
    return { held, intentId: payment.stripePaymentIntentId };
  };
  const payWithTestCard = async (intentId: string) => {
    const paid = await api.paymentIntents.confirm(intentId, { payment_method: "pm_card_visa" });
    expect(paid.status).toBe("succeeded");
  };
  const refundedAtStripe = async (intentId: string): Promise<number> => {
    const intent = await api.paymentIntents.retrieve(intentId, { expand: ["latest_charge"] });
    return (intent.latest_charge as Stripe.Charge).amount_refunded;
  };

  beforeAll(async () => {
    const key = process.env.STRIPE_SECRET_KEY ?? "";
    if (!key.startsWith("sk_test_")) throw new Error("These tests only run with a Stripe TEST key in .env");
    ctx = await openTestDatabase();
    const configured = stripeGateway();
    if (!configured) throw new Error("Stripe gateway is not configured");
    gateway = configured;
    api = new Stripe(key);
  });
  beforeEach(async () => {
    await resetTestDatabase(ctx.client);
    await seedInitialConfiguration(ctx.db);
    tableId = new Map((await ctx.db.select().from(schema.diningTable)).map((row) => [row.number, row.id]));
  });
  afterAll(async () => {
    await ctx.close();
  });

  it(
    "a payment that succeeds after the hold was released is refunded in full, once",
    async () => {
      const { held, intentId } = await startPayment();
      const late = addMinutes(NOW, 12);
      await expireHolds(ctx.db, late);
      await payWithTestCard(intentId);

      const outcome = await handlePaymentSucceeded(ctx.db, gateway, intentId, late);
      expect(outcome).toEqual({ kind: "REFUNDED_HOLD_EXPIRED", reservationId: held.reservationId });
      expect(await refundedAtStripe(intentId)).toBe(17000);
      expect(await getPaymentSummary(ctx.db, held.reservationId)).toMatchObject({ status: "REFUNDED", refundedCents: 17000 });

      // The table was not taken by the late payment.
      const availability = await getAvailability(ctx.db, { date: DATE, time: "20:00", partySize: 2 }, late);
      expect(availability.tables.find((table) => table.number === 1)?.state).toBe("AVAILABLE");

      // Stripe delivering the event again changes nothing.
      await handlePaymentSucceeded(ctx.db, gateway, intentId, late);
      expect(await refundedAtStripe(intentId)).toBe(17000);
      expect((await ctx.db.select().from(schema.refund)).length).toBe(1);
    },
    STRIPE_TIMEOUT,
  );

  it(
    "a manager refunds part, then the rest, of a late cancellation; never more than was paid",
    async () => {
      const { held, intentId } = await startPayment();
      await payWithTestCard(intentId);
      await handlePaymentSucceeded(ctx.db, gateway, intentId, NOW);

      // Cancelled three hours before the visit: the policy refunds nothing.
      const { outcome } = await cancelReservation(ctx.db, held.reservationId, "guest", new Date("2027-08-12T14:00:00Z"));
      expect(outcome.refundCents).toBe(0);
      expect(await refundedAtStripe(intentId)).toBe(0);

      const first = await discretionaryRefund(ctx.db, gateway, held.reservationId, { amountCents: 6000, reason: "Guest was ill" }, "manager-1");
      expect(first).toEqual({ refundedCents: 6000, totalRefundedCents: 6000 });
      expect(await refundedAtStripe(intentId)).toBe(6000);
      expect((await getPaymentSummary(ctx.db, held.reservationId))?.status).toBe("PARTIALLY_REFUNDED");

      // Asking for far more than is left refunds only what is left.
      const second = await discretionaryRefund(ctx.db, gateway, held.reservationId, { amountCents: 99900, reason: "Remainder" }, "manager-1");
      expect(second).toEqual({ refundedCents: 11000, totalRefundedCents: 17000 });
      expect(await refundedAtStripe(intentId)).toBe(17000);
      expect((await getPaymentSummary(ctx.db, held.reservationId))?.status).toBe("REFUNDED");

      await expect(
        discretionaryRefund(ctx.db, gateway, held.reservationId, { amountCents: 100, reason: "Again" }, "manager-1"),
      ).rejects.toMatchObject({ code: "INVALID_SELECTION" });
      expect(await refundedAtStripe(intentId)).toBe(17000);
    },
    STRIPE_TIMEOUT,
  );
});
