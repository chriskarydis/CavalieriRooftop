import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import { attachGuestDetails, confirmReservation, createHold, getAvailability, type Selection } from "@/server/services/booking";
import {
  addClosure,
  ConfigError,
  createCategory,
  createCombination,
  createPairing,
  setPairingActive,
  updateCategory,
  updateCombination,
  updateSettings,
  updateTable,
  type CategoryInput,
  type SettingsInput,
  type TableInput,
} from "@/server/services/configuration";
import { BookingError, loadSettings } from "@/server/services/context";
import { blockTables, moveReservation, previewMove, releaseBlock } from "@/server/services/table-ops";
import { openTestDatabase, resetTestDatabase } from "./test-db";

const DATE = "2027-08-12";
const BOOKED_AT = new Date("2027-08-01T10:00:00Z");
const AT_2000 = new Date("2027-08-12T17:00:00Z");
const MANAGER = "manager-1";

describe("configuration and table operations", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tables: Map<number, typeof schema.diningTable.$inferSelect>;
  let categories: Map<string, typeof schema.tableCategory.$inferSelect>;
  let combinations: Map<string, string>;

  const id = (number: number): string => tables.get(number)!.id;
  const tableInput = (number: number, changes: Partial<TableInput> = {}): TableInput => {
    const table = tables.get(number)!;
    return {
      capacity: table.capacity,
      maxCapacity: table.maxCapacity,
      categoryId: table.categoryId,
      status: table.status,
      statusReason: "",
      onlineBookable: table.onlineBookable,
      autoAssignable: table.autoAssignable,
      priority: table.priority,
      viewDescription: { en: "", el: "" },
      notes: "",
      ...changes,
    };
  };
  const categoryInput = (name: string, changes: Partial<CategoryInput> = {}): CategoryInput => {
    const category = categories.get(name)!;
    return {
      name: { en: category.name.en, el: category.name.el },
      description: { en: "", el: "" },
      extraFeeCents: category.extraFeeCents,
      feeCountsTowardMinSpend: category.feeCountsTowardMinSpend,
      priority: category.priority,
      color: category.color,
      displayOrder: category.displayOrder,
      active: category.active,
      ...changes,
    };
  };
  const settingsInput = async (changes: Partial<SettingsInput> = {}): Promise<SettingsInput> => {
    const current = await loadSettings(ctx.db);
    return { ...current, ...changes };
  };
  const availability = (partySize: number, time = "20:00") =>
    getAvailability(ctx.db, { date: DATE, time, partySize }, BOOKED_AT);
  const book = async (partySize: number, selection: Selection, time = "20:00") => {
    const held = await createHold(ctx.db, { date: DATE, time, partySize, selection, locale: "en" }, BOOKED_AT);
    await attachGuestDetails(ctx.db, held.reservationId, { name: "Test Guest", email: "guest@example.com" }, BOOKED_AT);
    await confirmReservation(ctx.db, held.reservationId, "system", BOOKED_AT);
    return held;
  };
  const failure = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
      return "NO_ERROR";
    } catch (error) {
      if (error instanceof ConfigError || error instanceof BookingError) return error.code;
      throw error;
    }
  };
  const audited = async (action: string): Promise<number> =>
    (await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, action))).length;

  beforeAll(async () => {
    ctx = await openTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase(ctx.client);
    await seedInitialConfiguration(ctx.db);
    tables = new Map((await ctx.db.select().from(schema.diningTable)).map((table) => [table.number, table]));
    categories = new Map((await ctx.db.select().from(schema.tableCategory)).map((category) => [category.name.en, category]));
    combinations = new Map(
      (await ctx.db.select().from(schema.tableCombination)).map((combination) => [combination.name, combination.id]),
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe("tables", () => {
    it("a disabled table disappears from guest availability and automatic assignment", async () => {
      await updateTable(ctx.db, id(19), tableInput(19, { status: "OUT_OF_SERVICE", statusReason: "Broken leg" }), MANAGER);
      const result = await availability(2);
      expect(result.tables.some((table) => table.number === 19)).toBe(false);
      const auto = await createHold(
        ctx.db,
        { date: DATE, time: "20:00", partySize: 2, selection: { mode: "AUTO" }, locale: "en" },
        BOOKED_AT,
      );
      expect(auto.tableIds).not.toContain(id(19));
      expect(await audited("table.status_changed")).toBe(1);
    });

    it("reports upcoming reservations on a table and leaves them untouched", async () => {
      await book(2, { mode: "TABLE", tableId: id(19) });
      const result = await updateTable(ctx.db, id(19), tableInput(19, { status: "OUT_OF_SERVICE" }), MANAGER);
      expect(result.upcoming).toBe(1);
      const [allocation] = await ctx.db
        .select()
        .from(schema.tableAllocation)
        .where(eq(schema.tableAllocation.tableId, id(19)));
      expect(allocation.releasedAt).toBeNull();
    });

    it("changing capacity and category changes the price of new bookings", async () => {
      const premium = categories.get("Premium")!.id;
      await updateTable(ctx.db, id(19), tableInput(19, { capacity: 4, maxCapacity: 4, categoryId: premium }), MANAGER);
      const result = await availability(2);
      expect(result.tables.find((table) => table.number === 19)?.price).toMatchObject({
        depositCents: 12000,
        tableFeeCents: 5000,
      });
    });

    it("rejects impossible values", async () => {
      expect(await failure(updateTable(ctx.db, id(19), tableInput(19, { capacity: 4, maxCapacity: 2 }), MANAGER))).toBe("INVALID");
      expect(await failure(updateTable(ctx.db, id(19), tableInput(19, { capacity: 0 }), MANAGER))).toBe("INVALID");
      expect(
        await failure(updateTable(ctx.db, id(19), tableInput(19, { categoryId: "00000000-0000-4000-8000-000000000000" }), MANAGER)),
      ).toBe("INVALID");
    });
  });

  describe("categories", () => {
    it("a fee change applies to new bookings and never to an existing reservation", async () => {
      const before = await book(2, { mode: "TABLE", tableId: id(1) });
      await updateCategory(ctx.db, categories.get("Premium")!.id, categoryInput("Premium", { extraFeeCents: 8000 }), MANAGER);

      const result = await availability(2, "20:00");
      expect(result.tables.find((table) => table.number === 2)?.price?.tableFeeCents).toBe(8000);
      const [reservation] = await ctx.db
        .select()
        .from(schema.reservation)
        .where(eq(schema.reservation.id, before.reservationId));
      expect(reservation).toMatchObject({ tableFeeCents: 5000, totalCents: 17000 });
      expect(await audited("category.fee_changed")).toBe(1);
    });

    it("creates a new category that tables can use", async () => {
      const categoryId = await createCategory(
        ctx.db,
        { ...categoryInput("Standard"), name: { en: "Sunset Row", el: "Ηλιοβασίλεμα" }, extraFeeCents: 3500, active: true },
        MANAGER,
      );
      await updateTable(ctx.db, id(19), tableInput(19, { categoryId }), MANAGER);
      const result = await availability(2);
      expect(result.tables.find((table) => table.number === 19)?.price?.tableFeeCents).toBe(3500);
    });

    it("refuses to deactivate a category that tables still use", async () => {
      expect(
        await failure(updateCategory(ctx.db, categories.get("Premium")!.id, categoryInput("Premium", { active: false }), MANAGER)),
      ).toBe("IN_USE");
    });

    it("rejects a negative fee and a missing name", async () => {
      const premium = categories.get("Premium")!.id;
      expect(await failure(updateCategory(ctx.db, premium, categoryInput("Premium", { extraFeeCents: -1 }), MANAGER))).toBe("INVALID");
      expect(
        await failure(updateCategory(ctx.db, premium, categoryInput("Premium", { name: { en: "", el: "" } }), MANAGER)),
      ).toBe("INVALID");
    });
  });

  describe("combinations and pairings", () => {
    const combo = { capacity: 7, minParty: 6, active: true, onlineBookable: true, priority: 0 };

    it("a deactivated combination is no longer offered", async () => {
      await updateCombination(ctx.db, combinations.get("18+33")!, { ...combo, active: false }, MANAGER);
      const result = await availability(7);
      expect(result.groups.some((group) => group.combinationIds.includes(combinations.get("18+33")!))).toBe(false);
    });

    it("a new combination is offered at its configured capacity", async () => {
      const created = await createCombination(ctx.db, { tableIds: [id(13), id(14)], capacity: 8, minParty: 5 }, MANAGER);
      const result = await availability(8);
      expect(result.groups.find((group) => group.combinationIds[0] === created)).toMatchObject({
        capacity: 8,
        price: { totalCents: 24000, tableFeeCents: 0 },
      });
      expect(await failure(createCombination(ctx.db, { tableIds: [id(13), id(14)], capacity: 8, minParty: 5 }, MANAGER))).toBe("DUPLICATE");
    });

    it("rejects a combination of one table or with a minimum above its capacity", async () => {
      expect(await failure(createCombination(ctx.db, { tableIds: [id(13), id(13)], capacity: 8, minParty: 5 }, MANAGER))).toBe("INVALID");
      expect(await failure(createCombination(ctx.db, { tableIds: [id(13), id(14)], capacity: 4, minParty: 5 }, MANAGER))).toBe("INVALID");
    });

    it("disabling a pairing removes that option for 16 guests", async () => {
      const [pairing] = await ctx.db
        .select()
        .from(schema.combinationPairing)
        .where(eq(schema.combinationPairing.firstCombinationId, combinations.get("1+6")!));
      expect((await availability(16)).groups).toHaveLength(4);
      await setPairingActive(ctx.db, pairing.id, false, MANAGER);
      expect((await availability(16)).groups).toHaveLength(3);
    });

    it("refuses a pairing of groups that share a table or that already exists", async () => {
      expect(await failure(createPairing(ctx.db, combinations.get("1+6")!, combinations.get("1+6+12")!, MANAGER))).toBe("INVALID");
      expect(await failure(createPairing(ctx.db, combinations.get("2+70+7")!, combinations.get("1+6")!, MANAGER))).toBe("DUPLICATE");
      expect(await failure(createPairing(ctx.db, combinations.get("23+24")!, combinations.get("18+33")!, MANAGER))).toBe("NO_ERROR");
    });
  });

  describe("settings", () => {
    it("a new deposit applies to new bookings only", async () => {
      const before = await book(2, { mode: "TABLE", tableId: id(19) });
      await updateSettings(ctx.db, await settingsInput({ depositPerPersonCents: 4000 }), MANAGER);
      expect((await availability(2)).auto?.price.totalCents).toBe(8000);
      const [reservation] = await ctx.db
        .select()
        .from(schema.reservation)
        .where(eq(schema.reservation.id, before.reservationId));
      expect(reservation.totalCents).toBe(6000);
      expect(await audited("settings.updated")).toBe(1);
    });

    it("opening rules take effect: weekday, time slots, party limit, closed date", async () => {
      await updateSettings(
        ctx.db,
        await settingsInput({ closedWeekdays: [4], timeSlots: ["19:00", "21:00"], maxOnlineParty: 8 }),
        MANAGER,
      );
      expect(await failure(availability(2, "21:00"))).toBe("CLOSED");

      await updateSettings(ctx.db, await settingsInput({ closedWeekdays: [1] }), MANAGER);
      expect(await failure(availability(2, "20:00"))).toBe("INVALID_SLOT");
      expect(await failure(availability(2, "21:00"))).toBe("NO_ERROR");
      expect(await failure(availability(9, "21:00"))).toBe("PARTY_SIZE");

      await addClosure(ctx.db, { date: DATE, reason: "Private event" }, MANAGER);
      expect(await failure(availability(2, "21:00"))).toBe("CLOSED");
      expect(await failure(addClosure(ctx.db, { date: DATE, reason: "" }, MANAGER))).toBe("DUPLICATE");
    });

    it("rejects a block shorter than the dining time and malformed slots", async () => {
      expect(await failure(updateSettings(ctx.db, await settingsInput({ diningMinutes: 120, blockMinutes: 90 }), MANAGER))).toBe("INVALID");
      expect(await failure(updateSettings(ctx.db, await settingsInput({ timeSlots: ["8pm"] }), MANAGER))).toBe("INVALID");
      expect(await failure(updateSettings(ctx.db, await settingsInput({ seasonStart: "13-01" }), MANAGER))).toBe("INVALID");
    });
  });

  describe("manual blocks", () => {
    it("a blocked table cannot be booked until the block is removed", async () => {
      await blockTables(
        ctx.db,
        { tableIds: [id(19)], from: addMinutes(AT_2000, -60), until: addMinutes(AT_2000, 240), reason: "Wind" },
        MANAGER,
      );
      expect((await availability(2)).tables.find((table) => table.number === 19)?.state).toBe("TAKEN");

      const [block] = await ctx.db.select().from(schema.tableAllocation).where(eq(schema.tableAllocation.kind, "BLOCK"));
      await releaseBlock(ctx.db, block.id, MANAGER, BOOKED_AT);
      expect((await availability(2)).tables.find((table) => table.number === 19)?.state).toBe("AVAILABLE");
    });

    it("refuses to block over an existing reservation", async () => {
      await book(2, { mode: "TABLE", tableId: id(19) });
      expect(
        await failure(blockTables(ctx.db, { tableIds: [id(19)], from: AT_2000, until: addMinutes(AT_2000, 60) }, MANAGER)),
      ).toBe("TABLE_UNAVAILABLE");
    });
  });

  describe("moving a reservation", () => {
    it("moves to a free table, frees the old one and keeps what the guest paid", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(19) });
      const preview = await previewMove(ctx.db, booked.reservationId, [id(1)]);
      expect(preview).toMatchObject({
        fromTableNumbers: [19],
        toTableNumbers: [1],
        paid: { totalCents: 6000 },
        target: { depositCents: 12000, tableFeeCents: 5000 },
        differenceCents: 11000,
      });

      await moveReservation(ctx.db, booked.reservationId, [id(1)], MANAGER, BOOKED_AT);
      const result = await availability(2);
      expect(result.tables.find((table) => table.number === 19)?.state).toBe("AVAILABLE");
      expect(result.tables.find((table) => table.number === 1)?.state).toBe("TAKEN");

      const [reservation] = await ctx.db
        .select()
        .from(schema.reservation)
        .where(eq(schema.reservation.id, booked.reservationId));
      expect(reservation).toMatchObject({ status: "CONFIRMED", totalCents: 6000, tableFeeCents: 0 });
      const [entry] = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "reservation.moved"));
      expect(entry.after).toMatchObject({ tables: [1], differenceCents: 11000 });
    });

    it("refuses a taken table and leaves the reservation where it was", async () => {
      const booked = await book(2, { mode: "TABLE", tableId: id(19) });
      await book(2, { mode: "TABLE", tableId: id(20) });
      expect(await failure(moveReservation(ctx.db, booked.reservationId, [id(20)], MANAGER, BOOKED_AT))).toBe("TABLE_UNAVAILABLE");
      expect((await availability(2)).tables.find((table) => table.number === 19)?.state).toBe("TAKEN");
    });

    it("refuses a table that is too small, disabled, or an unconfigured pair", async () => {
      const booked = await book(4, { mode: "TABLE", tableId: id(13) });
      expect(await failure(moveReservation(ctx.db, booked.reservationId, [id(19)], MANAGER, BOOKED_AT))).toBe("INVALID_SELECTION");
      expect(await failure(moveReservation(ctx.db, booked.reservationId, [id(19), id(20)], MANAGER, BOOKED_AT))).toBe("INVALID_SELECTION");
      expect(await failure(moveReservation(ctx.db, booked.reservationId, [id(99)], MANAGER, BOOKED_AT))).toBe("INVALID_SELECTION");
    });

    it("can move onto a combination that includes the current table", async () => {
      const booked = await book(4, { mode: "TABLE", tableId: id(18) });
      await moveReservation(ctx.db, booked.reservationId, [id(18), id(33)], MANAGER, BOOKED_AT);
      const result = await availability(2);
      expect(result.tables.find((table) => table.number === 33)?.state).toBe("TAKEN");
    });
  });
});
