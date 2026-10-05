import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import { getAnalytics } from "@/server/services/analytics";
import { attachGuestDetails, confirmReservation, createHold } from "@/server/services/booking";
import { BookingError } from "@/server/services/context";
import { createWalkIn, extendWalkIn, suggestWalkInTables } from "@/server/services/floor-service";
import { getReservationByToken } from "@/server/services/guest-reservation";
import { anonymiseOldGuests } from "@/server/services/retention";
import { openTestDatabase, resetTestDatabase } from "./test-db";

const AT_2000 = new Date("2027-08-12T17:00:00Z");
const BOOKED_AT = new Date("2027-08-01T10:00:00Z");
const STAFF = "staff-1";

describe("retention and walk-in extension", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tableId: Map<number, string>;

  const book = async (date: string, email: string, table = 19) => {
    const held = await createHold(
      ctx.db,
      { date, time: "20:00", partySize: 2, selection: { mode: "TABLE", tableId: tableId.get(table)! }, locale: "en" },
      BOOKED_AT,
    );
    await attachGuestDetails(
      ctx.db,
      held.reservationId,
      { name: "Maria Guest", email, phone: "+30 690 000 0000", notes: "Anniversary" },
      BOOKED_AT,
    );
    await confirmReservation(ctx.db, held.reservationId, "system", BOOKED_AT);
    return held;
  };
  const customerOf = async (reservationId: string) => {
    const [row] = await ctx.db
      .select({ customer: schema.customer, reservation: schema.reservation })
      .from(schema.reservation)
      .innerJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
      .where(eq(schema.reservation.id, reservationId));
    return row;
  };
  const setRetention = (months: number | null) =>
    ctx.db.update(schema.restaurantSettings).set({ retentionMonths: months });

  beforeAll(async () => {
    ctx = await openTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(ctx.client);
    await seedInitialConfiguration(ctx.db);
    tableId = new Map((await ctx.db.select().from(schema.diningTable)).map((row) => [row.number, row.id]));
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe("guest data retention", () => {
    it("does nothing until a retention period is set", async () => {
      const old = await book("2027-08-12", "old@example.com");
      expect(await anonymiseOldGuests(ctx.db, new Date("2035-01-01T00:00:00Z"))).toBe(0);
      expect((await customerOf(old.reservationId)).customer.email).toBe("old@example.com");
    });

    it("erases guests whose last reservation is older than the period, and only those", async () => {
      await setRetention(24);
      const old = await book("2027-08-12", "old@example.com", 19);
      const recent = await book("2029-06-12", "recent@example.com", 20);
      const now = new Date("2029-09-01T00:00:00Z");

      expect(await anonymiseOldGuests(ctx.db, now)).toBe(1);
      const erased = await customerOf(old.reservationId);
      expect(erased.customer).toMatchObject({ name: "Removed", phone: null, notes: null, anonymisedAt: now });
      expect(erased.customer.email).toMatch(/^removed-.+@invalid$/);
      expect(erased.reservation.guestNotes).toBeNull();
      expect((await customerOf(recent.reservationId)).customer).toMatchObject({ name: "Maria Guest", email: "recent@example.com" });

      // Running again finds nothing more to do.
      expect(await anonymiseOldGuests(ctx.db, now)).toBe(0);
    });

    it("keeps the reservation itself: the figures and the guest's link still work", async () => {
      await setRetention(12);
      const old = await book("2027-08-12", "old@example.com");
      await anonymiseOldGuests(ctx.db, new Date("2029-01-01T00:00:00Z"));

      const data = await getAnalytics(ctx.db, { from: "2027-08-12", to: "2027-08-12" });
      expect(data).toMatchObject({ reservations: 1, covers: 2, depositCents: 6000 });
      const found = await getReservationByToken(ctx.db, old.manageToken);
      expect(found?.reservation.reference).toBe(old.reference);
      expect(found?.customer?.name).toBe("Removed");
    });

    it("keeps a guest inside the period by the exact month boundary", async () => {
      await setRetention(24);
      const held = await book("2027-08-12", "edge@example.com");
      // 20:00 Athens on 12 August 2027 is 17:00Z; 24 months later, one minute before.
      expect(await anonymiseOldGuests(ctx.db, new Date("2029-08-12T16:59:00Z"))).toBe(0);
      expect(await anonymiseOldGuests(ctx.db, new Date("2029-08-12T17:01:00Z"))).toBe(1);
      expect((await customerOf(held.reservationId)).customer.name).toBe("Removed");
    });
  });

  describe("extending a walk-in", () => {
    const walkIn = (table: number, minutes = 60) =>
      createWalkIn(ctx.db, { partySize: 2, kind: "DRINKS", tableIds: [tableId.get(table)!], expectedMinutes: minutes }, STAFF, AT_2000);
    const suggests = async (table: number, at: Date) =>
      (await suggestWalkInTables(ctx.db, { partySize: 2, expectedMinutes: 15 }, at)).some((candidate) =>
        candidate.tableIds.includes(tableId.get(table)!),
      );

    it("keeps the table for another 30 minutes", async () => {
      const { walkInId } = await walkIn(19);
      expect(await suggests(19, addMinutes(AT_2000, 65))).toBe(true);
      await extendWalkIn(ctx.db, walkInId, 30, STAFF);
      expect(await suggests(19, addMinutes(AT_2000, 65))).toBe(false);
      expect(await suggests(19, addMinutes(AT_2000, 95))).toBe(true);
      const [row] = await ctx.db.select().from(schema.walkIn).where(eq(schema.walkIn.id, walkInId));
      expect(row.expectedMinutes).toBe(90);
    });

    it("is refused when the table is reserved by then, and the stay is unchanged", async () => {
      // A reservation at 21:30 on table 19; the walk-in sits 20:00-21:00.
      const held = await createHold(
        ctx.db,
        { date: "2027-08-12", time: "21:30", partySize: 2, selection: { mode: "TABLE", tableId: tableId.get(19)! }, locale: "en" },
        BOOKED_AT,
      );
      await attachGuestDetails(ctx.db, held.reservationId, { name: "Later Guest", email: "later@example.com" }, BOOKED_AT);
      await confirmReservation(ctx.db, held.reservationId, "system", BOOKED_AT);
      const { walkInId } = await walkIn(19, 60);

      await extendWalkIn(ctx.db, walkInId, 30, STAFF);
      await expect(extendWalkIn(ctx.db, walkInId, 30, STAFF)).rejects.toMatchObject({ code: "TABLE_UNAVAILABLE" });
      const [row] = await ctx.db.select().from(schema.walkIn).where(eq(schema.walkIn.id, walkInId));
      expect(row.expectedMinutes).toBe(90);
    });

    it("rejects an unknown walk-in and a non-positive extension", async () => {
      await expect(extendWalkIn(ctx.db, "00000000-0000-4000-8000-000000000000", 30, STAFF)).rejects.toBeInstanceOf(BookingError);
      const { walkInId } = await walkIn(19);
      await expect(extendWalkIn(ctx.db, walkInId, 0, STAFF)).rejects.toMatchObject({ code: "INVALID_SELECTION" });
    });
  });
});
