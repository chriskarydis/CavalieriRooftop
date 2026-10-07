import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import { getAvailability } from "@/server/services/booking";
import { BookingError } from "@/server/services/context";
import { notifyReservationEvent } from "@/server/services/notifications";
import { canMove } from "@/server/services/reschedule";
import { createStaffReservation } from "@/server/services/staff-booking";
import { openTestDatabase, resetTestDatabase } from "./test-db";

const MANAGER = "staff-1";
const NOW = new Date("2027-08-01T10:00:00Z");
const DATE = "2027-08-12";

describe("a reservation taken by staff", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let id: (number: number) => string;

  const book = (overrides: Partial<Parameters<typeof createStaffReservation>[1]> = {}) =>
    createStaffReservation(
      ctx.db,
      { date: DATE, time: "21:15", partySize: 3, name: "Nikos Phone", phone: "6900000000", locale: "el", tableIds: [], ...overrides },
      MANAGER,
      NOW,
    );
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

  it("is confirmed at once with no deposit, at any time staff choose, and takes the table from online guests", async () => {
    const created = await book({ tableIds: [id(1)] });
    const [row] = await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.id, created.reservationId));
    expect(row).toMatchObject({ status: "CONFIRMED", source: "STAFF", partySize: 3, depositCents: 0, tableFeeCents: 0, totalCents: 0, tableSetByStaff: true });
    expect(row.startsAt.toISOString()).toBe("2027-08-12T18:15:00.000Z");
    const online = await getAvailability(ctx.db, { date: DATE, time: "21:00", partySize: 2 }, NOW);
    expect(online.tables.find((table) => table.number === 1)?.state).toBe("TAKEN");
  });

  it("finds the best free table when none is chosen, and refuses a taken table or a closed day", async () => {
    const first = await book();
    expect(first.tableIds).toHaveLength(1);
    expect(await codeOf(book({ tableIds: first.tableIds }))).toBe("TABLE_UNAVAILABLE");
    expect(await codeOf(book({ date: "2027-08-16" }))).toBe("CLOSED"); // a Monday
    expect(await codeOf(book({ tableIds: [id(19)], partySize: 6 }))).toBe("INVALID_SELECTION");
  });

  it("emails the guest only when an address is given, without money in it, and cannot be moved by the guest", async () => {
    const sent: Array<{ to: string; text: string }> = [];
    const transport = async (message: { to: string; text: string }) => {
      sent.push(message);
      return { status: "SENT" as const, providerId: "test" };
    };
    const without = await book();
    await notifyReservationEvent(ctx.db, without.reservationId, "CREATED_BY_STAFF", { transport });
    expect(sent).toEqual([]);

    const withEmail = await book({ email: "guest@example.com", locale: "en", time: "22:00" });
    await notifyReservationEvent(ctx.db, withEmail.reservationId, "CREATED_BY_STAFF", { transport });
    expect(sent.map((message) => message.to)).toEqual(["guest@example.com"]);
    expect(sent[0].text).toContain(withEmail.reference);
    expect(sent[0].text).not.toContain("€");

    const [row] = await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.id, withEmail.reservationId));
    const [settings] = await ctx.db.select().from(schema.restaurantSettings);
    expect(canMove(row, settings, NOW)).toBe(false);
  });
});
