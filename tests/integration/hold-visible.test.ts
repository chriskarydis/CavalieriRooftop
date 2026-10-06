import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import { attachGuestDetails, confirmReservation, createHold } from "@/server/services/booking";
import { getLiveFloor } from "@/server/services/live-floor";
import { getTimeline } from "@/server/services/timeline";
import { openTestDatabase, resetTestDatabase } from "./test-db";

// 15:00 in Corfu on Thursday 12 August 2027; the guest is booking 20:00 that evening.
const NOW = new Date("2027-08-12T12:00:00Z");
const DATE = "2027-08-12";

describe("a table a guest is reserving right now, as staff see it", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tableId: string;

  const table19 = async (now: Date) => (await getLiveFloor(ctx.db, now)).find((table) => table.number === 19)!;
  const timeline19 = async (now: Date) => (await getTimeline(ctx.db, DATE, now)).tables.find((table) => table.number === 19)!.entries;
  const hold = (date = DATE) =>
    createHold(ctx.db, { date, time: "20:00", partySize: 2, selection: { mode: "TABLE", tableId }, locale: "en" }, NOW);

  beforeAll(async () => {
    ctx = await openTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(ctx.client);
    await seedInitialConfiguration(ctx.db);
    tableId = (await ctx.db.select().from(schema.diningTable)).find((row) => row.number === 19)!.id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("shows as being reserved, first without and then with the guest's details", async () => {
    const held = await hold();
    let table = await table19(NOW);
    expect(table.state).toBe("HELD");
    expect(table.bookings).toMatchObject([{ kind: "HOLD", partySize: 2, guestName: null, guestPhone: null }]);
    expect(table.bookings[0].holdExpiresAt?.toISOString()).toBe("2027-08-12T12:10:00.000Z");

    await attachGuestDetails(ctx.db, held.reservationId, { name: "Maria Guest", email: "maria@example.com", phone: "+30 690 111 2222" }, NOW);
    table = await table19(NOW);
    expect(table.bookings[0]).toMatchObject({ kind: "HOLD", guestName: "Maria Guest", guestPhone: "+30 690 111 2222", guestEmail: "maria@example.com" });
    expect(await timeline19(NOW)).toMatchObject([{ kind: "HOLD", label: "Maria Guest", phone: "+30 690 111 2222", tableNumber: 19 }]);
  });

  it("turns into a reservation when the guest pays", async () => {
    const held = await hold();
    await attachGuestDetails(ctx.db, held.reservationId, { name: "Maria Guest", email: "maria@example.com" }, NOW);
    await confirmReservation(ctx.db, held.reservationId, "test", NOW);
    const table = await table19(NOW);
    expect(table.state).toBe("RESERVED");
    expect(table.bookings).toMatchObject([{ kind: "RESERVATION", reservationStatus: "CONFIRMED", holdExpiresAt: null }]);
    expect((await timeline19(NOW))[0]).toMatchObject({ kind: "RESERVATION", status: "CONFIRMED" });
  });

  it("goes back to empty when the 10 minutes run out", async () => {
    await hold();
    const later = new Date(NOW.getTime() + 11 * 60_000);
    const table = await table19(later);
    expect(table.state).toBe("AVAILABLE");
    expect(table.bookings).toEqual([]);
    expect(await timeline19(later)).toEqual([]);
  });

  it("does not appear on the live floor when it is for more than 12 hours ahead", async () => {
    await hold("2027-08-13");
    const table = await table19(NOW);
    expect(table.state).toBe("AVAILABLE");
    expect(table.bookings).toEqual([]);
  });
});
