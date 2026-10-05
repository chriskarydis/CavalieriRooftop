import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import {
  attachGuestDetails,
  confirmReservation,
  createHold,
  getAvailability,
  hashManageToken,
  manageTokenFor,
  MAX_HOLDS_PER_ADDRESS,
  type Holder,
  type Selection,
} from "@/server/services/booking";
import { BookingError } from "@/server/services/context";
import { openTestDatabase, resetTestDatabase } from "./test-db";

const DATE = "2027-08-12";
const NOW = new Date("2027-08-01T10:00:00Z");

describe("one hold per guest", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tableId: Map<number, string>;
  let combinationId: Map<string, string>;

  const visitor = (name: string, ipHash: string | null = null): Holder => ({ id: `visitor-${name}`, ipHash });
  const hold = (holder: Holder | undefined, selection: Selection, partySize = 2, now = NOW) =>
    createHold(ctx.db, { date: DATE, time: "20:00", partySize, selection, locale: "en", holder }, now);
  const table = (number: number): Selection => ({ mode: "TABLE", tableId: tableId.get(number)! });
  const stateOf = async (number: number, now = NOW) =>
    (await getAvailability(ctx.db, { date: DATE, time: "20:00", partySize: 2 }, now)).tables.find(
      (entry) => entry.number === number,
    )?.state;
  const statusOf = async (reservationId: string) =>
    (await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.id, reservationId)))[0].status;

  beforeAll(async () => {
    ctx = await openTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(ctx.client);
    await seedInitialConfiguration(ctx.db);
    tableId = new Map((await ctx.db.select().from(schema.diningTable)).map((row) => [row.number, row.id]));
    combinationId = new Map((await ctx.db.select().from(schema.tableCombination)).map((row) => [row.name, row.id]));
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("a new selection releases the same visitor's previous hold", async () => {
    const first = await hold(visitor("a"), table(19));
    const second = await hold(visitor("a"), table(1));

    expect(await statusOf(first.reservationId)).toBe("EXPIRED");
    expect(await statusOf(second.reservationId)).toBe("PENDING_PAYMENT");
    expect(await stateOf(19)).toBe("AVAILABLE");
    expect(await stateOf(1)).toBe("HELD");
  });

  it("lets the visitor re-select the very table they were holding", async () => {
    await hold(visitor("a"), table(19));
    const again = await hold(visitor("a"), table(19));
    expect(await statusOf(again.reservationId)).toBe("PENDING_PAYMENT");
  });

  it("does not touch another visitor's hold", async () => {
    const other = await hold(visitor("b"), table(19));
    await hold(visitor("a"), table(20));
    expect(await statusOf(other.reservationId)).toBe("PENDING_PAYMENT");
    expect(await stateOf(19)).toBe("HELD");
  });

  it("a party of 16 holds all the tables of its one seating, and only those", async () => {
    const pair = [combinationId.get("1+6")!, combinationId.get("2+70+7")!];
    const big = await hold(visitor("a"), { mode: "GROUP", combinationIds: pair }, 16);
    expect(big.tableIds).toHaveLength(5);

    await hold(visitor("a"), table(19));
    expect(await statusOf(big.reservationId)).toBe("EXPIRED");
    expect(await stateOf(1)).toBe("AVAILABLE");
  });

  it("never releases a reservation the visitor has already paid for", async () => {
    const paid = await hold(visitor("a"), table(19));
    await attachGuestDetails(ctx.db, paid.reservationId, { name: "Test Guest", email: "guest@example.com" }, NOW);
    await confirmReservation(ctx.db, paid.reservationId, "system", NOW);

    await hold(visitor("a"), table(20));
    expect(await statusOf(paid.reservationId)).toBe("CONFIRMED");
    expect(await stateOf(19)).toBe("TAKEN");
  });

  it("keeps the previous hold when the new selection is refused", async () => {
    await hold(visitor("b"), table(20));
    const mine = await hold(visitor("a"), table(19));
    await expect(hold(visitor("a"), table(20))).rejects.toMatchObject({ code: "TABLE_UNAVAILABLE" });
    expect(await statusOf(mine.reservationId)).toBe("PENDING_PAYMENT");
  });

  it("caps simultaneous holds from one network address, and frees the cap as holds expire", async () => {
    const address = "hash-of-one-address";
    const tables = [19, 20, 21, 22, 25, 26, 27, 28, 30, 31, 32];
    for (let index = 0; index < MAX_HOLDS_PER_ADDRESS; index++) {
      await hold(visitor(`guest-${index}`, address), table(tables[index]));
    }
    const refused = hold(visitor("one-more", address), table(tables[MAX_HOLDS_PER_ADDRESS]));
    await expect(refused).rejects.toBeInstanceOf(BookingError);
    await expect(refused).rejects.toMatchObject({ code: "TOO_MANY_HOLDS" });

    // Someone at a different address is unaffected.
    await hold(visitor("elsewhere", "another-address"), table(33));

    const later = addMinutes(NOW, 11);
    const afterExpiry = await hold(visitor("one-more", address), table(tables[MAX_HOLDS_PER_ADDRESS]), 2, later);
    expect(await statusOf(afterExpiry.reservationId)).toBe("PENDING_PAYMENT");
  });

  it("manage tokens are derived from the reservation id and only their hash is stored", async () => {
    const held = await hold(visitor("a"), table(19));
    expect(held.manageToken).toBe(manageTokenFor(held.reservationId));
    expect(held.manageToken.length).toBeGreaterThanOrEqual(43);
    const [row] = await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.id, held.reservationId));
    expect(row.manageTokenHash).toBe(hashManageToken(held.manageToken));
    expect(JSON.stringify(row)).not.toContain(held.manageToken);
    expect(manageTokenFor("another-id")).not.toBe(held.manageToken);
  });
});
