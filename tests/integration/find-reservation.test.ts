import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import { attachGuestDetails, confirmReservation, createHold, manageTokenFor } from "@/server/services/booking";
import { contactMatches, findReservation, LOOKUP_ATTEMPTS, normaliseReference } from "@/server/services/find-reservation";
import { openTestDatabase, resetTestDatabase } from "./test-db";

const NOW = new Date("2027-08-01T10:00:00Z");

describe("finding a reservation without the link", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let reference: string;
  let reservationId: string;

  const find = (ref: string, contact: string, ipHash: string | null = "a", now = NOW) =>
    findReservation(ctx.db, { reference: ref, contact, ipHash }, now);

  beforeAll(async () => {
    ctx = await openTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(ctx.client);
    await seedInitialConfiguration(ctx.db);
    const [table] = (await ctx.db.select().from(schema.diningTable)).filter((row) => row.number === 7);
    const held = await createHold(
      ctx.db,
      { date: "2027-08-12", time: "20:00", partySize: 2, selection: { mode: "TABLE", tableId: table.id }, locale: "en" },
      NOW,
    );
    await attachGuestDetails(ctx.db, held.reservationId, { name: "Test Guest", email: "Guest@Example.com", phone: "+30 690 123 4567" }, NOW);
    await confirmReservation(ctx.db, held.reservationId, "test", NOW);
    ({ reference, reservationId } = held);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("reads the number however it is typed", () => {
    expect(normaliseReference(" crg-1000 ")).toBe("CRG-1000");
    expect(normaliseReference("CRG 1000")).toBe("CRG-1000");
    expect(normaliseReference("1000")).toBe("CRG-1000");
  });

  it("accepts the email in any case and the phone with or without country code, and nothing shorter", () => {
    const customer = { email: "guest@example.com", phone: "+30 690 123 4567" };
    expect(contactMatches("GUEST@example.com ", customer)).toBe(true);
    expect(contactMatches("6901234567", customer)).toBe(true);
    expect(contactMatches("0030 690 1234567", customer)).toBe(true);
    expect(contactMatches("4567", customer)).toBe(false);
    expect(contactMatches("other@example.com", customer)).toBe(false);
    expect(contactMatches("6901234567", { email: "guest@example.com", phone: null })).toBe(false);
  });

  it("opens the reservation with the number and the email or the phone", async () => {
    const token = manageTokenFor(reservationId);
    expect(await find(reference, "guest@example.com")).toEqual({ found: true, token });
    expect(await find(reference.replace("CRG-", ""), "690 123 4567")).toEqual({ found: true, token });
  });

  it("gives the same answer for a wrong number and a wrong contact", async () => {
    expect(await find(reference, "someone@else.com")).toEqual({ found: false, reason: "NOT_FOUND" });
    expect(await find("CRG-999999", "guest@example.com")).toEqual({ found: false, reason: "NOT_FOUND" });
  });

  it("does not open a reservation that was never paid", async () => {
    const [table] = (await ctx.db.select().from(schema.diningTable)).filter((row) => row.number === 8);
    const held = await createHold(
      ctx.db,
      { date: "2027-08-12", time: "20:00", partySize: 2, selection: { mode: "TABLE", tableId: table.id }, locale: "en" },
      NOW,
    );
    await attachGuestDetails(ctx.db, held.reservationId, { name: "Unpaid", email: "unpaid@example.com" }, NOW);
    expect(await find(held.reference, "unpaid@example.com")).toEqual({ found: false, reason: "NOT_FOUND" });
  });

  it("stops guessing from one address after a few attempts, for a while, without affecting others", async () => {
    for (let attempt = 0; attempt < LOOKUP_ATTEMPTS; attempt++) {
      expect(await find("CRG-1", "nobody@example.com")).toEqual({ found: false, reason: "NOT_FOUND" });
    }
    // Even the right details are refused now.
    expect(await find(reference, "guest@example.com")).toEqual({ found: false, reason: "TOO_MANY_ATTEMPTS" });
    expect((await find(reference, "guest@example.com", "b")).found).toBe(true);
    const later = new Date(NOW.getTime() + 16 * 60_000);
    expect((await find(reference, "guest@example.com", "a", later)).found).toBe(true);
  });
});
