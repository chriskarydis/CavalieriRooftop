import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import { getAnalytics } from "@/server/services/analytics";
import { attachGuestDetails, confirmReservation, createHold, getAvailability, type Selection } from "@/server/services/booking";
import { ConfigError } from "@/server/services/configuration";
import { createTable, saveFloorLayout, setTablesStatus, type TableLayout } from "@/server/services/floor-admin";
import {
  cancelReservation,
  completeReservation,
  createWalkIn,
  flagLateReservations,
  markNoShow,
  seatReservation,
} from "@/server/services/floor-service";
import { blockTables } from "@/server/services/table-ops";
import { getTimeline } from "@/server/services/timeline";
import { openTestDatabase, resetTestDatabase } from "./test-db";

// Thursday 12 August 2027; Athens is UTC+3.
const DATE = "2027-08-12";
const BOOKED_AT = new Date("2027-08-01T10:00:00Z");
const AT_2000 = new Date("2027-08-12T17:00:00Z");
const MANAGER = "manager-1";

describe("analytics, timeline and floor administration", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tables: Map<number, typeof schema.diningTable.$inferSelect>;
  let combinationId: Map<string, string>;

  const id = (number: number): string => tables.get(number)!.id;
  const book = async (partySize: number, selection: Selection, time = "20:00", date = DATE) => {
    const held = await createHold(ctx.db, { date, time, partySize, selection, locale: "en" }, BOOKED_AT);
    await attachGuestDetails(ctx.db, held.reservationId, { name: `Guest ${held.reference}`, email: "guest@example.com" }, BOOKED_AT);
    await confirmReservation(ctx.db, held.reservationId, "system", BOOKED_AT);
    return held;
  };
  const failure = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
      return "NO_ERROR";
    } catch (error) {
      if (error instanceof ConfigError) return error.code;
      throw error;
    }
  };

  beforeAll(async () => {
    ctx = await openTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(ctx.client);
    await seedInitialConfiguration(ctx.db);
    tables = new Map((await ctx.db.select().from(schema.diningTable)).map((table) => [table.number, table]));
    combinationId = new Map((await ctx.db.select().from(schema.tableCombination)).map((row) => [row.name, row.id]));
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe("analytics", () => {
    it("is all zeros for an empty period", async () => {
      const data = await getAnalytics(ctx.db, { from: DATE, to: DATE });
      expect(data).toMatchObject({ reservations: 0, covers: 0, averagePartySize: 0, noShowRate: 0, tableUse: 0 });
      expect(data.byHour).toEqual([]);
    });

    it("counts an evening correctly", async () => {
      // Honoured: premium table chosen (2 guests: 120 + 50), auto-assigned couple (60), 7 on 18+33 (210).
      await book(2, { mode: "TABLE", tableId: id(1) }, "20:00");
      await book(2, { mode: "AUTO" }, "20:00");
      await book(7, { mode: "GROUP", combinationIds: [combinationId.get("18+33")!] }, "21:00");
      // Cancelled late (kept 70), and a no-show (kept 60).
      const cancelled = await book(2, { mode: "TABLE", tableId: id(70) }, "19:00");
      await cancelReservation(ctx.db, cancelled.reservationId, "guest", addMinutes(AT_2000, -120));
      const noShow = await book(2, { mode: "TABLE", tableId: id(20) }, "19:00");
      await flagLateReservations(ctx.db, AT_2000);
      await markNoShow(ctx.db, noShow.reservationId, MANAGER, AT_2000);
      // An abandoned checkout must not count.
      await createHold(
        ctx.db,
        { date: DATE, time: "22:30", partySize: 2, selection: { mode: "TABLE", tableId: id(21) }, locale: "en" },
        BOOKED_AT,
      );
      // Another day must not count.
      await book(4, { mode: "TABLE", tableId: id(13) }, "20:00", "2027-08-13");
      await createWalkIn(ctx.db, { partySize: 3, kind: "DRINKS", tableIds: [id(29)], expectedMinutes: 60 }, MANAGER, AT_2000);
      await createWalkIn(ctx.db, { partySize: 2, kind: "FOOD", tableIds: [id(30)], expectedMinutes: 60 }, MANAGER, AT_2000);

      const data = await getAnalytics(ctx.db, { from: DATE, to: DATE });
      expect(data).toMatchObject({
        reservations: 5,
        covers: 11,
        cancellations: 1,
        noShows: 1,
        noShowRate: 0.2,
        depositCents: 12000 + 6000 + 21000,
        tableFeeCents: 5000,
        retainedCents: 7000 + 6000,
        refundedCents: 0,
        chosenTable: 2,
        autoAssigned: 1,
        walkIns: 2,
        walkInCovers: 5,
        walkInsForDrinks: 1,
      });
      expect(data.averagePartySize).toBeCloseTo(11 / 3);
      expect(data.byHour).toEqual([
        { label: "20:00", count: 2 },
        { label: "21:00", count: 1 },
      ]);
      expect(data.coversByWeekday.find((row) => row.weekday === 4)?.covers).toBe(11);
      expect(data.coversByWeekday.filter((row) => row.weekday !== 4).every((row) => row.covers === 0)).toBe(true);
      expect(data.feeByCategory).toEqual([{ category: "Premium", count: 1, feeCents: 5000 }]);
      // Chosen: table 1 once, and the two tables of the combination once each. The auto-assigned table is not listed.
      expect(data.chosenTables.map((row) => row.tableNumber).sort((a, b) => a - b)).toEqual([1, 18, 33]);
      expect(data.chosenTables.find((row) => row.tableNumber === 1)).toMatchObject({ count: 1, feeCents: 5000 });
      // 4 tables used (1, the auto table, 18, 33) of 35 active tables on one evening.
      expect(data.tableUse).toBeCloseTo(4 / 35);
    });

    it("covers a range of dates", async () => {
      await book(2, { mode: "TABLE", tableId: id(19) }, "20:00", "2027-08-12");
      await book(4, { mode: "TABLE", tableId: id(13) }, "20:00", "2027-08-14");
      expect((await getAnalytics(ctx.db, { from: "2027-08-12", to: "2027-08-14" })).covers).toBe(6);
      expect((await getAnalytics(ctx.db, { from: "2027-08-13", to: "2027-08-13" })).covers).toBe(0);
    });
  });

  describe("timeline", () => {
    it("shows each table's evening: reservations, walk-ins, blocks and early departures", async () => {
      const seated = await book(2, { mode: "TABLE", tableId: id(19) }, "20:00");
      await book(7, { mode: "GROUP", combinationIds: [combinationId.get("18+33")!] }, "21:00");
      await blockTables(ctx.db, { tableIds: [id(22)], from: AT_2000, until: addMinutes(AT_2000, 120), reason: "Wind" }, MANAGER);
      await seatReservation(ctx.db, seated.reservationId, MANAGER, AT_2000);
      await completeReservation(ctx.db, seated.reservationId, MANAGER, addMinutes(AT_2000, 70));
      await createWalkIn(ctx.db, { partySize: 2, kind: "DRINKS", tableIds: [id(30)], expectedMinutes: 60, name: "Bar" }, MANAGER, AT_2000);

      const timeline = await getTimeline(ctx.db, DATE, addMinutes(AT_2000, 80));
      expect(timeline.windowStart.toISOString()).toBe("2027-08-12T15:00:00.000Z");
      const row = (number: number) => timeline.tables.find((table) => table.number === number)!;

      expect(row(19).entries).toMatchObject([{ kind: "RESERVATION", status: "COMPLETED", partySize: 2 }]);
      // Left after 70 minutes: the bar ends then, not at the planned end of the block.
      expect(row(19).entries[0].endsAt).toEqual(addMinutes(AT_2000, 70));
      expect(row(18).entries).toMatchObject([{ kind: "RESERVATION", status: "CONFIRMED", partySize: 7 }]);
      expect(row(33).entries).toHaveLength(1);
      expect(row(22).entries).toMatchObject([{ kind: "BLOCK", label: "Wind" }]);
      expect(row(30).entries).toMatchObject([{ kind: "WALK_IN", label: "Bar", partySize: 2 }]);
      expect(row(21).entries).toEqual([]);
      // The inactive spare table has nothing on it and is not listed.
      expect(timeline.tables.some((table) => table.number === 99)).toBe(false);
    });

    it("leaves out cancelled reservations and other dates", async () => {
      const cancelled = await book(2, { mode: "TABLE", tableId: id(19) }, "20:00");
      await cancelReservation(ctx.db, cancelled.reservationId, "guest", BOOKED_AT);
      await book(2, { mode: "TABLE", tableId: id(19) }, "20:00", "2027-08-13");
      const timeline = await getTimeline(ctx.db, DATE, BOOKED_AT);
      expect(timeline.tables.find((table) => table.number === 19)?.entries).toEqual([]);
    });
  });

  describe("closing several tables", () => {
    it("takes tables out of service together, reports reservations on them, and reopens them", async () => {
      await book(2, { mode: "TABLE", tableId: id(19) });
      const closed = await setTablesStatus(
        ctx.db,
        { tableIds: [id(19), id(20), id(21)], status: "OUT_OF_SERVICE", reason: "Storm" },
        MANAGER,
      );
      expect(closed).toEqual({ changed: 3, upcoming: 1 });

      const during = await getAvailability(ctx.db, { date: DATE, time: "22:30", partySize: 2 }, BOOKED_AT);
      expect(during.tables.some((table) => [19, 20, 21].includes(table.number))).toBe(false);
      const [row] = await ctx.db.select().from(schema.diningTable).where(eq(schema.diningTable.number, 20));
      expect(row).toMatchObject({ status: "OUT_OF_SERVICE", statusReason: "Storm" });

      // Doing it again changes nothing.
      expect(await setTablesStatus(ctx.db, { tableIds: [id(19), id(20)], status: "OUT_OF_SERVICE", reason: "" }, MANAGER)).toEqual({
        changed: 0,
        upcoming: 0,
      });

      expect(await setTablesStatus(ctx.db, { tableIds: [id(19), id(20), id(21)], status: "ACTIVE", reason: "" }, MANAGER)).toEqual({
        changed: 3,
        upcoming: 0,
      });
      const after = await getAvailability(ctx.db, { date: DATE, time: "22:30", partySize: 2 }, BOOKED_AT);
      expect(after.tables.find((table) => table.number === 20)?.state).toBe("AVAILABLE");
    });

    it("needs at least one table", async () => {
      expect(await failure(setTablesStatus(ctx.db, { tableIds: [], status: "OUT_OF_SERVICE", reason: "" }, MANAGER))).toBe("INVALID");
    });
  });

  describe("floor layout", () => {
    const layoutOf = (number: number, change: Partial<TableLayout> = {}): TableLayout => {
      const table = tables.get(number)!;
      return { id: table.id, x: table.x, y: table.y, width: table.width, height: table.height, rotation: table.rotation, shape: table.shape, ...change };
    };

    it("saves moved, resized and rotated tables", async () => {
      await saveFloorLayout(ctx.db, [layoutOf(19, { x: 500, y: 900, rotation: 45 }), layoutOf(15, { shape: "RECT", width: 200 })], MANAGER);
      const [moved] = await ctx.db.select().from(schema.diningTable).where(eq(schema.diningTable.number, 19));
      const [reshaped] = await ctx.db.select().from(schema.diningTable).where(eq(schema.diningTable.number, 15));
      expect(moved).toMatchObject({ x: 500, y: 900, rotation: 45 });
      expect(reshaped).toMatchObject({ shape: "RECT", width: 200 });
    });

    it("rejects a table outside the plan, an impossible size, or an unknown table, and saves nothing", async () => {
      const outside = saveFloorLayout(ctx.db, [layoutOf(20, { x: 400 }), layoutOf(19, { x: 5000 })], MANAGER);
      expect(await failure(outside)).toBe("INVALID");
      expect(await failure(saveFloorLayout(ctx.db, [layoutOf(19, { width: 5 })], MANAGER))).toBe("INVALID");
      const unknown = { ...layoutOf(19), id: "00000000-0000-4000-8000-000000000000" };
      expect(await failure(saveFloorLayout(ctx.db, [layoutOf(20, { x: 400 }), unknown], MANAGER))).toBe("NOT_FOUND");
      const [untouched] = await ctx.db.select().from(schema.diningTable).where(eq(schema.diningTable.number, 20));
      expect(untouched.x).toBe(tables.get(20)!.x);
    });

    it("adds a table that starts inactive and so is not bookable", async () => {
      const categoryId = tables.get(19)!.categoryId;
      await createTable(ctx.db, { number: 34, capacity: 2, maxCapacity: 2, categoryId }, MANAGER);
      const [created] = await ctx.db.select().from(schema.diningTable).where(eq(schema.diningTable.number, 34));
      expect(created).toMatchObject({ status: "INACTIVE", capacity: 2, x: 616.5, y: 1000 });
      const availability = await getAvailability(ctx.db, { date: DATE, time: "20:00", partySize: 2 }, BOOKED_AT);
      expect(availability.tables.some((table) => table.number === 34)).toBe(false);

      expect(await failure(createTable(ctx.db, { number: 34, capacity: 2, maxCapacity: 2, categoryId }, MANAGER))).toBe("DUPLICATE");
      expect(await failure(createTable(ctx.db, { number: 10, capacity: 0, maxCapacity: 2, categoryId }, MANAGER))).toBe("INVALID");
    });
  });
});
