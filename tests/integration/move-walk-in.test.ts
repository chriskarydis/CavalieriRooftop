import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import { attachGuestDetails, confirmReservation, createHold } from "@/server/services/booking";
import { BookingError } from "@/server/services/context";
import { createWalkIn, moveWalkIn } from "@/server/services/floor-service";
import { openTestDatabase, resetTestDatabase } from "./test-db";

const MANAGER = "staff-1";
// 20:00 in Corfu on Thursday 12 August 2027.
const AT_2000 = new Date("2027-08-12T17:00:00Z");

describe("moving a walk-in party to another table", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let id: (number: number) => string;

  const tablesOf = async (walkInId: string) =>
    (
      await ctx.db
        .select({ number: schema.diningTable.number })
        .from(schema.tableAllocation)
        .innerJoin(schema.diningTable, eq(schema.tableAllocation.tableId, schema.diningTable.id))
        .where(and(eq(schema.tableAllocation.walkInId, walkInId), isNull(schema.tableAllocation.releasedAt)))
    )
      .map((row) => row.number)
      .sort((a, b) => a - b);
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
    const tables = await ctx.db.select().from(schema.diningTable);
    id = (number) => tables.find((table) => table.number === number)!.id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("frees the old table and takes the new one until the same time", async () => {
    const { walkInId, until } = await createWalkIn(ctx.db, { partySize: 2, kind: "DRINKS", tableIds: [id(19)], expectedMinutes: 90 }, MANAGER, AT_2000);
    const later = addMinutes(AT_2000, 20);
    const result = await moveWalkIn(ctx.db, walkInId, [id(20)], MANAGER, later);
    expect(result).toEqual({ fromTableNumbers: [19], toTableNumbers: [20], until });
    expect(await tablesOf(walkInId)).toEqual([20]);

    // Table 19 can be given to someone else straight away, table 20 cannot.
    await createWalkIn(ctx.db, { partySize: 2, kind: "FOOD", tableIds: [id(19)], expectedMinutes: 60 }, MANAGER, later);
    expect(await codeOf(createWalkIn(ctx.db, { partySize: 2, kind: "FOOD", tableIds: [id(20)], expectedMinutes: 60 }, MANAGER, later))).toBe("TABLE_UNAVAILABLE");
  });

  it("refuses a table that is taken or reserved during the stay, and one too small, and changes nothing", async () => {
    const { walkInId } = await createWalkIn(ctx.db, { partySize: 4, kind: "FOOD", tableIds: [id(13)], expectedMinutes: 120 }, MANAGER, AT_2000);
    await createWalkIn(ctx.db, { partySize: 4, kind: "FOOD", tableIds: [id(14)], expectedMinutes: 60 }, MANAGER, AT_2000);
    const held = await createHold(
      ctx.db,
      { date: "2027-08-12", time: "21:00", partySize: 4, selection: { mode: "TABLE", tableId: id(2) }, locale: "en" },
      AT_2000,
    );
    await attachGuestDetails(ctx.db, held.reservationId, { name: "Later Guest", email: "later@example.com" }, AT_2000);
    await confirmReservation(ctx.db, held.reservationId, "test", AT_2000);

    expect(await codeOf(moveWalkIn(ctx.db, walkInId, [id(14)], MANAGER, AT_2000))).toBe("TABLE_UNAVAILABLE");
    expect(await codeOf(moveWalkIn(ctx.db, walkInId, [id(2)], MANAGER, AT_2000))).toBe("TABLE_UNAVAILABLE");
    expect(await codeOf(moveWalkIn(ctx.db, walkInId, [id(19)], MANAGER, AT_2000))).toBe("INVALID_SELECTION");
    expect(await tablesOf(walkInId)).toEqual([13]);
  });

  it("gives a party that has overstayed half an hour at the new table", async () => {
    const { walkInId, until } = await createWalkIn(ctx.db, { partySize: 2, kind: "DRINKS", tableIds: [id(19)], expectedMinutes: 30 }, MANAGER, AT_2000);
    const late = addMinutes(until, 10);
    const result = await moveWalkIn(ctx.db, walkInId, [id(20)], MANAGER, late);
    expect(result.until).toEqual(addMinutes(late, 30));
  });

  it("cannot move a party that has already left", async () => {
    expect(await codeOf(moveWalkIn(ctx.db, "00000000-0000-4000-8000-000000000000", [id(20)], MANAGER, AT_2000))).toBe("NOT_FOUND");
  });
});
