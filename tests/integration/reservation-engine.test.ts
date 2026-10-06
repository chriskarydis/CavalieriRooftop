import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InvalidTransitionError } from "@/domain/reservation-state";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import {
  attachGuestDetails,
  confirmReservation,
  createHold,
  expireHolds,
  getAvailability,
  type HoldResult,
  type Selection,
} from "@/server/services/booking";
import { BookingError } from "@/server/services/context";
import {
  cancelReservation,
  closeOutLateReservations,
  completeReservation,
  createWalkIn,
  flagLateReservations,
  markNoShow,
  seatReservation,
  suggestWalkInTables,
} from "@/server/services/floor-service";
import { openTestDatabase, resetTestDatabase } from "./test-db";

// Thursday 12 August 2027. Athens is UTC+3, so the 20:00 slot is 17:00Z.
const DATE = "2027-08-12";
const BOOKED_AT = new Date("2027-08-01T10:00:00Z");
const AT_2000 = new Date("2027-08-12T17:00:00Z");
const STAFF = "staff-1";
const GUEST_DETAILS = { name: "Test Guest", email: "guest@example.com", phone: "+30 000 0000" };

describe("reservation engine", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tableId: Map<number, string>;
  let combinationId: Map<string, string>;

  const id = (number: number): string => tableId.get(number)!;
  const hold = (partySize: number, selection: Selection, time = "20:00", now = BOOKED_AT): Promise<HoldResult> =>
    createHold(ctx.db, { date: DATE, time, partySize, selection, locale: "en" }, now);
  const book = async (partySize: number, selection: Selection, time = "20:00"): Promise<HoldResult> => {
    const held = await hold(partySize, selection, time);
    await attachGuestDetails(ctx.db, held.reservationId, GUEST_DETAILS, BOOKED_AT);
    await confirmReservation(ctx.db, held.reservationId, "system", BOOKED_AT);
    return held;
  };
  const status = async (reservationId: string): Promise<string> => {
    const [row] = await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.id, reservationId));
    return row.status;
  };
  const code = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
      return "NO_ERROR";
    } catch (error) {
      if (error instanceof BookingError) return error.code;
      throw error;
    }
  };

  beforeAll(async () => {
    ctx = await openTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase(ctx.client);
    await seedInitialConfiguration(ctx.db);
    const tables = await ctx.db.select().from(schema.diningTable);
    tableId = new Map(tables.map((table) => [table.number, table.id]));
    const combinations = await ctx.db.select().from(schema.tableCombination);
    combinationId = new Map(combinations.map((combination) => [combination.name, combination.id]));
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe("slot validation", () => {
    const check = (date: string, time: string, partySize: number, now = BOOKED_AT) =>
      code(getAvailability(ctx.db, { date, time, partySize }, now));

    it("rejects Mondays, out-of-season dates, unknown slots, past times and oversized parties", async () => {
      expect(await check("2027-08-09", "20:00", 2)).toBe("CLOSED");
      expect(await check("2027-11-05", "20:00", 2)).toBe("CLOSED");
      expect(await check(DATE, "20:15", 2)).toBe("INVALID_SLOT");
      expect(await check(DATE, "20:00", 2, new Date("2027-08-12T17:00:00Z"))).toBe("IN_THE_PAST");
      expect(await check(DATE, "20:00", 17)).toBe("PARTY_SIZE");
      expect(await check(DATE, "20:00", 0)).toBe("PARTY_SIZE");
    });

    it("rejects a one-off closed date", async () => {
      await ctx.db.insert(schema.closure).values({ date: DATE, reason: "Storm" });
      expect(await check(DATE, "20:00", 2)).toBe("CLOSED");
    });
  });

  describe("availability and holds", () => {
    it("prices every table for the party and offers automatic assignment", async () => {
      const availability = await getAvailability(ctx.db, { date: DATE, time: "20:00", partySize: 2 }, BOOKED_AT);
      const table = (number: number) => availability.tables.find((entry) => entry.number === number);
      expect(table(19)).toMatchObject({ state: "AVAILABLE", price: { totalCents: 6000 } });
      expect(table(1)).toMatchObject({ state: "AVAILABLE", price: { depositCents: 12000, tableFeeCents: 5000 } });
      expect(table(70)).toMatchObject({ price: { totalCents: 7000 } });
      expect(table(29)).toMatchObject({ state: "AVAILABLE", price: { totalCents: 6000 } });
      expect(availability.tables.some((entry) => entry.number === 99)).toBe(false);
      expect(availability.auto?.price.totalCents).toBe(6000);
    });

    it("shows a held table as HELD to other guests and refuses a second hold", async () => {
      const first = await hold(2, { mode: "TABLE", tableId: id(19) });
      expect(first.price.totalCents).toBe(6000);
      expect(first.expiresAt).toEqual(addMinutes(BOOKED_AT, 10));

      const availability = await getAvailability(ctx.db, { date: DATE, time: "20:00", partySize: 2 }, BOOKED_AT);
      expect(availability.tables.find((entry) => entry.number === 19)?.state).toBe("HELD");
      expect(await code(hold(2, { mode: "TABLE", tableId: id(19) }))).toBe("TABLE_UNAVAILABLE");
    });

    it("blocks the table for 2.5 hours: 22:00 collides, 22:30 does not", async () => {
      await book(2, { mode: "TABLE", tableId: id(19) });
      expect(await code(hold(2, { mode: "TABLE", tableId: id(19) }, "22:00"))).toBe("TABLE_UNAVAILABLE");
      expect(await code(hold(2, { mode: "TABLE", tableId: id(19) }, "18:30"))).toBe("TABLE_UNAVAILABLE");
      expect(await code(hold(2, { mode: "TABLE", tableId: id(19) }, "22:30"))).toBe("NO_ERROR");
      const availability = await getAvailability(ctx.db, { date: DATE, time: "21:00", partySize: 2 }, BOOKED_AT);
      expect(availability.tables.find((entry) => entry.number === 19)?.state).toBe("TAKEN");
    });

    it("frees an abandoned hold after 10 minutes", async () => {
      const abandoned = await hold(2, { mode: "TABLE", tableId: id(19) });
      const later = addMinutes(BOOKED_AT, 11);

      const availability = await getAvailability(ctx.db, { date: DATE, time: "20:00", partySize: 2 }, later);
      expect(availability.tables.find((entry) => entry.number === 19)?.state).toBe("AVAILABLE");

      const next = await hold(2, { mode: "TABLE", tableId: id(19) }, "20:00", later);
      expect(next.reservationId).not.toBe(abandoned.reservationId);
      expect(await status(abandoned.reservationId)).toBe("EXPIRED");
      expect(await code(attachGuestDetails(ctx.db, abandoned.reservationId, GUEST_DETAILS, later))).toBe("HOLD_EXPIRED");
    });

    it("lets exactly one of 15 simultaneous guests take the same table", async () => {
      const attempts = await Promise.allSettled(
        Array.from({ length: 15 }, () => hold(2, { mode: "TABLE", tableId: id(1) })),
      );
      expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
      for (const attempt of attempts) {
        if (attempt.status === "rejected") expect((attempt.reason as BookingError).code).toBe("TABLE_UNAVAILABLE");
      }
    });

    it("gives simultaneous 'let us choose' guests different tables", async () => {
      const holds = await Promise.all(Array.from({ length: 3 }, () => hold(2, { mode: "AUTO" })));
      expect(new Set(holds.map((held) => held.tableIds[0])).size).toBe(3);
      expect(holds.every((held) => held.price.totalCents === 6000 && held.price.tableFeeCents === 0)).toBe(true);
    });

    it("rejects a table that is too small, inactive or unknown", async () => {
      expect(await code(hold(4, { mode: "TABLE", tableId: id(19) }))).toBe("INVALID_SELECTION");
      expect(await code(hold(2, { mode: "TABLE", tableId: id(99) }))).toBe("INVALID_SELECTION");
      await ctx.db.update(schema.diningTable).set({ status: "OUT_OF_SERVICE" }).where(eq(schema.diningTable.number, 19));
      expect(await code(hold(2, { mode: "TABLE", tableId: id(19) }))).toBe("INVALID_SELECTION");
      const auto = await hold(2, { mode: "AUTO" });
      expect(auto.tableIds).not.toContain(id(19));
    });
  });

  describe("combinations", () => {
    it("books 6 guests on 18+33 for 180 and blocks both tables", async () => {
      const booked = await book(6, { mode: "GROUP", combinationIds: [combinationId.get("18+33")!] });
      expect(booked.price).toMatchObject({ totalCents: 18000, tableFeeCents: 0 });
      expect(booked.tableIds.sort()).toEqual([id(18), id(33)].sort());
      expect(await code(hold(2, { mode: "TABLE", tableId: id(33) }))).toBe("TABLE_UNAVAILABLE");
      expect(await code(hold(4, { mode: "TABLE", tableId: id(18) }, "21:00"))).toBe("TABLE_UNAVAILABLE");
    });

    it("refuses a combination when one member is taken", async () => {
      await book(2, { mode: "TABLE", tableId: id(70) });
      expect(await code(hold(8, { mode: "GROUP", combinationIds: [combinationId.get("2+70+7")!] }))).toBe(
        "TABLE_UNAVAILABLE",
      );
    });

    it("books 16 guests across two neighbouring groups for 480", async () => {
      const pair = [combinationId.get("1+6")!, combinationId.get("2+70+7")!];
      const booked = await book(16, { mode: "GROUP", combinationIds: pair });
      expect(booked.price.totalCents).toBe(48000);
      expect(booked.tableIds).toHaveLength(5);
    });

    it("refuses groups that are not configured as neighbours", async () => {
      const pair = [combinationId.get("1+6")!, combinationId.get("5+11")!];
      expect(await code(hold(16, { mode: "GROUP", combinationIds: pair }))).toBe("INVALID_SELECTION");
    });
  });

  describe("confirmation", () => {
    it("requires guest details, then confirms once and is idempotent", async () => {
      const held = await hold(2, { mode: "TABLE", tableId: id(19) });
      expect(await code(confirmReservation(ctx.db, held.reservationId, "system", BOOKED_AT))).toBe("DETAILS_REQUIRED");
      await attachGuestDetails(ctx.db, held.reservationId, GUEST_DETAILS, BOOKED_AT);
      expect(await confirmReservation(ctx.db, held.reservationId, "system", BOOKED_AT)).toEqual({
        confirmed: true,
        alreadyConfirmed: false,
      });
      expect(await confirmReservation(ctx.db, held.reservationId, "system", BOOKED_AT)).toEqual({
        confirmed: true,
        alreadyConfirmed: true,
      });
      // A confirmed table is not released by the hold-expiry job.
      await expireHolds(ctx.db, addMinutes(BOOKED_AT, 60));
      expect(await status(held.reservationId)).toBe("CONFIRMED");
      expect(await code(hold(2, { mode: "TABLE", tableId: id(19) }, "20:00", addMinutes(BOOKED_AT, 60)))).toBe(
        "TABLE_UNAVAILABLE",
      );
    });

    it("honours a payment that lands just after expiry if the table was not released", async () => {
      const held = await hold(2, { mode: "TABLE", tableId: id(19) });
      await attachGuestDetails(ctx.db, held.reservationId, GUEST_DETAILS, BOOKED_AT);
      const late = addMinutes(BOOKED_AT, 11);
      expect((await confirmReservation(ctx.db, held.reservationId, "system", late)).confirmed).toBe(true);
    });

    it("reports HOLD_EXPIRED when the hold was already released, so the payment is refunded", async () => {
      const held = await hold(2, { mode: "TABLE", tableId: id(19) });
      await attachGuestDetails(ctx.db, held.reservationId, GUEST_DETAILS, BOOKED_AT);
      const late = addMinutes(BOOKED_AT, 11);
      await expireHolds(ctx.db, late);
      expect(await confirmReservation(ctx.db, held.reservationId, "system", late)).toEqual({
        confirmed: false,
        reason: "HOLD_EXPIRED",
      });
    });
  });

  describe("late arrival and no-show", () => {
    it("flags LATE only after the 15-minute grace period", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(19) });
      expect(await flagLateReservations(ctx.db, addMinutes(AT_2000, 15))).toEqual([]);
      expect(await flagLateReservations(ctx.db, addMinutes(AT_2000, 16))).toEqual([booked.reservationId]);
      expect(await status(booked.reservationId)).toBe("LATE");
    });

    it("lets staff seat late guests an hour after the reservation time", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(19) });
      await flagLateReservations(ctx.db, addMinutes(AT_2000, 16));
      await seatReservation(ctx.db, booked.reservationId, STAFF, addMinutes(AT_2000, 60));
      expect(await status(booked.reservationId)).toBe("SEATED");
    });

    it("releases the table on no-show and still lets staff seat the guests if it is free", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(19) });
      await flagLateReservations(ctx.db, addMinutes(AT_2000, 16));
      await markNoShow(ctx.db, booked.reservationId, STAFF, addMinutes(AT_2000, 20));

      const suggestions = await suggestWalkInTables(ctx.db, { partySize: 2, expectedMinutes: 90 }, addMinutes(AT_2000, 21));
      expect(suggestions.some((candidate) => candidate.tableIds.includes(id(19)))).toBe(true);

      await seatReservation(ctx.db, booked.reservationId, STAFF, addMinutes(AT_2000, 45));
      expect(await status(booked.reservationId)).toBe("SEATED");
    });

    it("refuses the no-show override when the table was given to a walk-in", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(19) });
      await flagLateReservations(ctx.db, addMinutes(AT_2000, 16));
      await markNoShow(ctx.db, booked.reservationId, STAFF, addMinutes(AT_2000, 20));
      await createWalkIn(
        ctx.db,
        { partySize: 2, kind: "DRINKS", tableIds: [id(19)], expectedMinutes: 90 },
        STAFF,
        addMinutes(AT_2000, 25),
      );
      expect(await code(seatReservation(ctx.db, booked.reservationId, STAFF, addMinutes(AT_2000, 45)))).toBe(
        "TABLE_UNAVAILABLE",
      );
      expect(await status(booked.reservationId)).toBe("NO_SHOW");
    });

    it("turns LATE into NO_SHOW automatically when the table block ends", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(19) });
      await flagLateReservations(ctx.db, addMinutes(AT_2000, 16));
      expect(await closeOutLateReservations(ctx.db, addMinutes(AT_2000, 149))).toEqual([]);
      expect(await closeOutLateReservations(ctx.db, addMinutes(AT_2000, 151))).toEqual([booked.reservationId]);
      expect(await status(booked.reservationId)).toBe("NO_SHOW");
    });

    it("cannot mark a reservation no-show before it is late", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(19) });
      await expect(markNoShow(ctx.db, booked.reservationId, STAFF, AT_2000)).rejects.toThrow(InvalidTransitionError);
    });

    it("frees the table when guests leave early", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(19) });
      await seatReservation(ctx.db, booked.reservationId, STAFF, AT_2000);
      await completeReservation(ctx.db, booked.reservationId, STAFF, addMinutes(AT_2000, 60));
      const walkIn = await createWalkIn(
        ctx.db,
        { partySize: 2, kind: "FOOD", tableIds: [id(19)], expectedMinutes: 60 },
        STAFF,
        addMinutes(AT_2000, 61),
      );
      expect(walkIn.shortened).toBe(false);
    });
  });

  describe("cancellation", () => {
    it("refunds deposit and table fee in full more than 24 hours ahead and frees the table", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(1) });
      const { outcome } = await cancelReservation(ctx.db, booked.reservationId, "guest", new Date("2027-08-10T10:00:00Z"));
      expect(outcome).toMatchObject({ refundable: true, refundCents: 17000 });
      expect(await status(booked.reservationId)).toBe("CANCELLED");
      expect(await code(hold(2, { mode: "TABLE", tableId: id(1) }))).toBe("NO_ERROR");
    });

    it("refunds nothing inside 24 hours", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(1) });
      const { outcome } = await cancelReservation(ctx.db, booked.reservationId, "guest", new Date("2027-08-11T17:01:00Z"));
      expect(outcome).toMatchObject({ refundable: false, refundCents: 0 });
    });

    it("cannot cancel a seated or completed reservation", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(19) });
      await seatReservation(ctx.db, booked.reservationId, STAFF, AT_2000);
      await expect(cancelReservation(ctx.db, booked.reservationId, STAFF, AT_2000)).rejects.toThrow(InvalidTransitionError);
    });
  });

  describe("walk-ins", () => {
    const at1900 = addMinutes(AT_2000, -60);
    const walkIn = (tables: number[], extra: Partial<Parameters<typeof createWalkIn>[1]> = {}, now = at1900) =>
      createWalkIn(
        ctx.db,
        { partySize: 2, kind: "DRINKS", tableIds: tables.map(id), expectedMinutes: 90, ...extra },
        STAFF,
        now,
      );

    it("seats a walk-in on a free table, including table 29", async () => {
      const result = await walkIn([29], { partySize: 3 });
      expect(result).toMatchObject({ shortened: false, until: addMinutes(at1900, 90) });
      expect(await code(walkIn([29]))).toBe("TABLE_UNAVAILABLE");
    });

    it("warns about an upcoming reservation and only proceeds on explicit override", async () => {
      await book(2, { mode: "TABLE", tableId: id(19) });
      expect(await code(walkIn([19]))).toBe("UPCOMING_RESERVATION");
      const result = await walkIn([19], { overrideUpcoming: true });
      expect(result).toMatchObject({ shortened: true, until: AT_2000 });
    });

    it("does not suggest a table with a reservation inside the expected stay", async () => {
      await book(2, { mode: "TABLE", tableId: id(19) });
      const suggestions = await suggestWalkInTables(ctx.db, { partySize: 2, expectedMinutes: 90 }, at1900);
      expect(suggestions.some((candidate) => candidate.tableIds.includes(id(19)))).toBe(false);
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it("refuses arbitrary table combinations and disabled tables", async () => {
      expect(await code(walkIn([19, 20], { partySize: 4 }))).toBe("INVALID_SELECTION");
      expect(await code(walkIn([99]))).toBe("INVALID_SELECTION");
      expect(await code(walkIn([18, 33], { partySize: 7 }))).toBe("NO_ERROR");
    });
  });

  it("records status history and an audit trail for staff actions", async () => {
    const booked = await book(2, { mode: "TABLE", tableId: id(19) });
    await seatReservation(ctx.db, booked.reservationId, STAFF, AT_2000);
    const events = await ctx.db
      .select()
      .from(schema.reservationEvent)
      .where(eq(schema.reservationEvent.reservationId, booked.reservationId));
    expect(events.map((event) => event.toStatus).sort()).toEqual(["CONFIRMED", "PENDING_PAYMENT", "SEATED"]);
    const audits = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, booked.reservationId));
    expect(audits).toMatchObject([{ actor: STAFF, action: "reservation.seated" }]);
  });
});
