import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import { attachGuestDetails, confirmReservation, createHold, getAvailability } from "@/server/services/booking";
import { BookingError } from "@/server/services/context";
import { getMoveOptions, rescheduleReservation } from "@/server/services/reschedule";
import { openTestDatabase, resetTestDatabase } from "./test-db";

// A Thursday and the Friday after it, both in season. NOW is eleven days before.
const DATE = "2027-08-12";
const NEW_DATE = "2027-08-13";
const NOW = new Date("2027-08-01T10:00:00Z");

describe("a guest moving their reservation", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tableId: Map<number, string>;

  /** A paid, confirmed reservation for two at the given table on DATE at 20:00. */
  const confirmed = async (table: number, partySize = 2) => {
    const held = await createHold(
      ctx.db,
      { date: DATE, time: "20:00", partySize, selection: { mode: "TABLE", tableId: tableId.get(table)! }, locale: "en" },
      NOW,
    );
    await attachGuestDetails(ctx.db, held.reservationId, { name: "Test Guest", email: "guest@example.com" }, NOW);
    await confirmReservation(ctx.db, held.reservationId, "test", NOW);
    return held;
  };
  const reservation = async (id: string) =>
    (await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.id, id)))[0];
  const activeTables = async (id: string) =>
    (
      await ctx.db
        .select({ number: schema.diningTable.number })
        .from(schema.tableAllocation)
        .innerJoin(schema.diningTable, eq(schema.tableAllocation.tableId, schema.diningTable.id))
        .where(and(eq(schema.tableAllocation.reservationId, id), isNull(schema.tableAllocation.releasedAt)))
    ).map((row) => row.number);
  const stateOf = async (date: string, table: number) =>
    (await getAvailability(ctx.db, { date, time: "20:00", partySize: 2 }, NOW)).tables.find((entry) => entry.number === table)?.state;
  const codeOf = async (attempt: Promise<unknown>) => {
    try {
      await attempt;
    } catch (error) {
      if (error instanceof BookingError) return error.code;
      throw error;
    }
    return null;
  };

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

  it("moves to another evening, frees the old table and leaves the money as paid", async () => {
    // Premium table 1 for two: 120 deposit + 50 fee.
    const held = await confirmed(1);
    const result = await rescheduleReservation(
      ctx.db,
      held.reservationId,
      { date: NEW_DATE, time: "21:00", selection: { mode: "TABLE", tableId: tableId.get(1)! } },
      "guest",
      NOW,
    );
    expect(result).toMatchObject({ paidCents: 17000, newPriceCents: 17000 });

    const row = await reservation(held.reservationId);
    expect(row.status).toBe("CONFIRMED");
    expect(row.startsAt.toISOString()).toBe("2027-08-13T18:00:00.000Z");
    expect([row.depositCents, row.tableFeeCents, row.totalCents]).toEqual([12000, 5000, 17000]);
    expect(await activeTables(held.reservationId)).toEqual([1]);
    expect(await stateOf(DATE, 1)).toBe("AVAILABLE");
    expect(await stateOf(NEW_DATE, 1)).toBe("TAKEN");
  });

  it("allows a cheaper table for the same money and never a dearer one", async () => {
    // Best for Two table 70: 60 deposit + 10 fee = 70.
    const held = await confirmed(70);
    const options = await getMoveOptions(ctx.db, held.reservationId, { date: NEW_DATE, time: "20:00" }, NOW);
    const offered = (number: number) => options.tables.find((table) => table.number === number)?.state;
    expect(offered(70)).toBe("AVAILABLE");
    expect(offered(7)).toBe("AVAILABLE"); // Standard for two: 60, less than was paid
    expect(offered(1)).toBe("NOT_SUITABLE"); // Premium: 170, more than was paid

    expect(
      await codeOf(
        rescheduleReservation(ctx.db, held.reservationId, { date: NEW_DATE, time: "20:00", selection: { mode: "TABLE", tableId: tableId.get(1)! } }, "guest", NOW),
      ),
    ).toBe("COSTS_MORE");

    await rescheduleReservation(
      ctx.db,
      held.reservationId,
      { date: NEW_DATE, time: "20:00", selection: { mode: "TABLE", tableId: tableId.get(7)! } },
      "guest",
      NOW,
    );
    const row = await reservation(held.reservationId);
    expect(row.totalCents).toBe(7000);
    expect(await activeTables(held.reservationId)).toEqual([7]);
  });

  it("does not let the guest's own reservation block a later time the same evening", async () => {
    const held = await confirmed(1);
    // 21:00 overlaps the guest's own 20:00 booking of table 1, which must not count against them.
    const options = await getMoveOptions(ctx.db, held.reservationId, { date: DATE, time: "21:00" }, NOW);
    expect(options.tables.find((table) => table.number === 1)?.state).toBe("AVAILABLE");
    await rescheduleReservation(
      ctx.db,
      held.reservationId,
      { date: DATE, time: "21:00", selection: { mode: "TABLE", tableId: tableId.get(1)! } },
      "guest",
      NOW,
    );
    expect((await reservation(held.reservationId)).startsAt.toISOString()).toBe("2027-08-12T18:00:00.000Z");
  });

  it("refuses a table someone else has, and a closed evening", async () => {
    const mine = await confirmed(1);
    const held = await createHold(
      ctx.db,
      { date: NEW_DATE, time: "20:00", partySize: 2, selection: { mode: "TABLE", tableId: tableId.get(1)! }, locale: "en" },
      NOW,
    );
    await attachGuestDetails(ctx.db, held.reservationId, { name: "Other Guest", email: "other@example.com" }, NOW);
    await confirmReservation(ctx.db, held.reservationId, "test", NOW);

    const move = (date: string) =>
      rescheduleReservation(ctx.db, mine.reservationId, { date, time: "20:00", selection: { mode: "TABLE", tableId: tableId.get(1)! } }, "guest", NOW);
    expect(await codeOf(move(NEW_DATE))).toBe("TABLE_UNAVAILABLE");
    expect(await codeOf(move("2027-08-16"))).toBe("CLOSED"); // a Monday
    // Nothing changed.
    expect((await reservation(mine.reservationId)).startsAt.toISOString()).toBe("2027-08-12T17:00:00.000Z");
    expect(await activeTables(mine.reservationId)).toEqual([1]);
  });

  it("is allowed until 24 hours before the reservation and not after, and counts from the new date once moved", async () => {
    const held = await confirmed(1);
    const selection = { mode: "TABLE", tableId: tableId.get(1)! } as const;
    const exactly24h = new Date("2027-08-11T17:00:00Z");
    const tooLate = new Date("2027-08-11T17:00:01Z");

    expect(await codeOf(rescheduleReservation(ctx.db, held.reservationId, { date: NEW_DATE, time: "20:00", selection }, "guest", tooLate))).toBe(
      "TOO_LATE_TO_MOVE",
    );
    expect(await codeOf(getMoveOptions(ctx.db, held.reservationId, { date: NEW_DATE, time: "20:00" }, tooLate))).toBe("TOO_LATE_TO_MOVE");

    await rescheduleReservation(ctx.db, held.reservationId, { date: "2027-08-20", time: "20:00", selection }, "guest", exactly24h);
    // A week later it can be moved again: the limit now counts from 20 August.
    await rescheduleReservation(ctx.db, held.reservationId, { date: "2027-08-21", time: "20:00", selection }, "guest", new Date("2027-08-18T10:00:00Z"));
    expect((await reservation(held.reservationId)).startsAt.toISOString()).toBe("2027-08-21T17:00:00.000Z");
  });

  it("cannot be used on a reservation that is not confirmed", async () => {
    const held = await createHold(
      ctx.db,
      { date: DATE, time: "20:00", partySize: 2, selection: { mode: "TABLE", tableId: tableId.get(1)! }, locale: "en" },
      NOW,
    );
    expect(
      await codeOf(
        rescheduleReservation(ctx.db, held.reservationId, { date: NEW_DATE, time: "20:00", selection: { mode: "TABLE", tableId: tableId.get(1)! } }, "guest", NOW),
      ),
    ).toBe("TOO_LATE_TO_MOVE");
  });
});
