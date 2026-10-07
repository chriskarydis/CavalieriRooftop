import { eq, ne } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import type { OutgoingEmail, SendResult } from "@/server/email/transport";
import { attachGuestDetails, confirmReservation, createHold } from "@/server/services/booking";
import { csvMoney, exportRange, exportReservations, toCsv } from "@/server/services/export";
import { cancelReservation } from "@/server/services/floor-service";
import { getGuestProfile, loadGuestStats, saveGuestNote, saveReservationNote } from "@/server/services/guest-history";
import { listUnreadNotifications, notificationSummary, notifyReservationEvent, sendReviewRequests } from "@/server/services/notifications";
import { createStaffReservation } from "@/server/services/staff-booking";
import {
  JOIN_ATTEMPTS,
  joinWaitingList,
  listWaiting,
  mayJoin,
  notifyWaitingEntry,
  notifyWaitingList,
  purgeWaitingList,
  removeWaiting,
  RENOTIFY_MINUTES,
} from "@/server/services/waiting-list";
import { openTestDatabase, resetTestDatabase } from "./test-db";

// A Thursday in season. NOW is eleven days before.
const DATE = "2027-08-12";
const NOW = new Date("2027-08-01T10:00:00Z");
const MANAGER = "staff-1";

describe("notes, history, waiting list, reviews and exports", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tableId: Map<number, string>;
  let outbox: OutgoingEmail[];

  const transport = async (email: OutgoingEmail): Promise<SendResult> => {
    outbox.push(email);
    return { status: "SENT", providerId: `test-${outbox.length}` };
  };
  /** A paid, confirmed reservation for two. */
  const book = async (
    guest: { name?: string; email: string; phone?: string; occasion?: schema.Occasion; notes?: string },
    options: { table?: number; date?: string; time?: string; now?: Date } = {},
  ) => {
    const now = options.now ?? NOW;
    const held = await createHold(
      ctx.db,
      {
        date: options.date ?? DATE,
        time: options.time ?? "20:00",
        partySize: 2,
        selection: { mode: "TABLE", tableId: tableId.get(options.table ?? 1)! },
        locale: "en",
      },
      now,
    );
    await attachGuestDetails(ctx.db, held.reservationId, { name: guest.name ?? "Anna Guest", ...guest }, now);
    await confirmReservation(ctx.db, held.reservationId, "test", now);
    return held;
  };
  const setStatus = (reservationId: string, status: schema.ReservationStatusValue) =>
    ctx.db.update(schema.reservation).set({ status }).where(eq(schema.reservation.id, reservationId));
  const customerOf = async (reservationId: string) =>
    (await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.id, reservationId)))[0].customerId!;
  /** Leaves table 28 as the only table in use, so one reservation fills the evening. */
  const onlyTable28 = () =>
    ctx.db.update(schema.diningTable).set({ status: "OUT_OF_SERVICE" }).where(ne(schema.diningTable.number, 28));

  beforeAll(async () => {
    ctx = await openTestDatabase();
    process.env.SITE_URL = "https://example.test";
    delete process.env.RESTAURANT_NOTIFICATION_EMAIL;
  });
  beforeEach(async () => {
    await resetTestDatabase(ctx.client);
    await seedInitialConfiguration(ctx.db);
    tableId = new Map((await ctx.db.select().from(schema.diningTable)).map((row) => [row.number, row.id]));
    outbox = [];
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe("guest history and notes", () => {
    it("recognises a returning guest by email or phone and counts visits and no-shows", async () => {
      const first = await book({ email: "anna@example.com", phone: "+30 690 111 2222" }, { date: "2027-08-05" });
      const second = await book({ email: "ANNA@example.com", phone: "2661000000" }, { date: "2027-08-06" });
      // Another address, the same mobile written without the country code.
      const third = await book({ email: "other@example.com", phone: "690 111 2222" }, { date: "2027-08-07" });
      const stranger = await book({ email: "someone@example.com", phone: "6999999999" }, { date: "2027-08-08" });
      const today = await book({ email: "anna@example.com", phone: "+30 690 111 2222" });
      await setStatus(first.reservationId, "COMPLETED");
      await setStatus(second.reservationId, "NO_SHOW");
      await setStatus(third.reservationId, "COMPLETED");
      await setStatus(stranger.reservationId, "COMPLETED");

      const statsFor = await loadGuestStats(ctx.db, [{ email: "anna@example.com", phone: "+30 690 111 2222" }]);
      expect(statsFor({ email: "anna@example.com", phone: "+30 690 111 2222" }, today.reservationId)).toMatchObject({
        reservations: 3,
        visits: 2,
        noShows: 1,
        cancelled: 0,
      });
      // A guest nobody asked about, and one with no contact details, have no history.
      expect(statsFor({ email: "someone@example.com", phone: null }).reservations).toBe(0);
      expect(statsFor({ email: "", phone: null }).reservations).toBe(0);

      const profile = await getGuestProfile(ctx.db, await customerOf(today.reservationId));
      expect(profile?.reservations.map((row) => row.reference)).toHaveLength(4);
      expect(profile?.stats).toMatchObject({ reservations: 4, visits: 2, noShows: 1 });
    });

    it("keeps a standing note with the guest across reservations, and a note on one reservation only", async () => {
      const first = await book({ email: "anna@example.com" }, { date: "2027-08-05" });
      await saveGuestNote(ctx.db, await customerOf(first.reservationId), "  Allergic to nuts. Likes table 5.  ", MANAGER);
      await saveReservationNote(ctx.db, first.reservationId, "Cake at 22:00", MANAGER);
      // Booked after the note was written.
      const later = await book({ email: "anna@example.com" });

      const statsFor = await loadGuestStats(ctx.db, [{ email: "anna@example.com", phone: null }]);
      expect(statsFor({ email: "anna@example.com", phone: null }, later.reservationId).note).toBe("Allergic to nuts. Likes table 5.");
      const [row] = await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.id, later.reservationId));
      expect(row.staffNotes).toBeNull();

      // Clearing the note clears it everywhere, and the log never holds its text.
      await saveGuestNote(ctx.db, await customerOf(later.reservationId), "", MANAGER);
      expect((await getGuestProfile(ctx.db, await customerOf(first.reservationId)))?.stats.note).toBeNull();
      const logged = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, "customer.note_changed"));
      expect(JSON.stringify(logged)).not.toContain("nuts");
    });

    it("stores the occasion and tells the restaurant, and offers the calendar in the confirmation", async () => {
      process.env.RESTAURANT_NOTIFICATION_EMAIL = "restaurant@example.com";
      const held = await book({ email: "anna@example.com", occasion: "BIRTHDAY", notes: "Window seat please" });
      await notifyReservationEvent(ctx.db, held.reservationId, "CONFIRMED", { transport });
      delete process.env.RESTAURANT_NOTIFICATION_EMAIL;

      const forRestaurant = outbox.find((email) => email.to === "restaurant@example.com")!;
      expect(forRestaurant.text).toContain("Occasion: Birthday");
      expect(forRestaurant.text).toContain("Guest's note: Window seat please");
      const forGuest = outbox.find((email) => email.to === "anna@example.com")!;
      expect(forGuest.text).toContain("Add to Google Calendar: https://calendar.google.com/calendar/render?");
      expect(forGuest.text).toContain("dates=20270812T170000Z%2F20270812T190000Z");
      expect(forGuest.text).toMatch(/Add to Apple Calendar or Outlook: https:\/\/example\.test\/en\/reservation\/[^/\s]+\/calendar/);

      const byStaff = await createStaffReservation(
        ctx.db,
        { date: DATE, time: "21:00", partySize: 2, name: "Nikos Phone", locale: "el", tableIds: [], occasion: "ANNIVERSARY" },
        MANAGER,
        NOW,
      );
      const [row] = await ctx.db.select().from(schema.reservation).where(eq(schema.reservation.id, byStaff.reservationId));
      expect(row.occasion).toBe("ANNIVERSARY");
    });
  });

  describe("waiting list", () => {
    const join = (email: string, now = NOW, extra: Partial<Parameters<typeof joinWaitingList>[1]> = {}) =>
      joinWaitingList(ctx.db, { date: DATE, time: "20:00", partySize: 2, name: "Waiting Guest", email, locale: "en", ...extra }, now);

    it("takes guests only when the evening is full, once each, and shows them to staff", async () => {
      await onlyTable28();
      expect(await join("early@example.com")).toEqual({ joined: false, reason: "AVAILABLE" });
      await book({ email: "anna@example.com" }, { table: 28 });

      const first = await join("First@Example.com");
      expect(first.joined).toBe(true);
      // The same address again changes the entry instead of adding one.
      expect(await join("first@example.com", NOW, { partySize: 1 })).toEqual(first);
      await join("second@example.com", addMinutes(NOW, 1));
      const list = await listWaiting(ctx.db, DATE);
      expect(list.map((entry) => [entry.email, entry.partySize, entry.status])).toEqual([
        ["first@example.com", 1, "WAITING"],
        ["second@example.com", 2, "WAITING"],
      ]);
      // Staff see it among the notifications, without a reservation number.
      const notifications = await listUnreadNotifications(ctx.db);
      expect(notifications.filter((entry) => entry.type === "WAITING_JOINED")).toHaveLength(2);
      expect((await notificationSummary(ctx.db)).latestId).toBe("");

      await removeWaiting(ctx.db, list[1].id, MANAGER);
      expect(await listWaiting(ctx.db, DATE)).toHaveLength(1);
    });

    it("tells the first in line when a table frees, then the next after two hours, and stops once someone books", async () => {
      await onlyTable28();
      const taken = await book({ email: "anna@example.com" }, { table: 28 });
      await join("first@example.com");
      await join("second@example.com", addMinutes(NOW, 1));
      await join("third@example.com", addMinutes(NOW, 2));

      // Still full: nobody is told.
      expect(await notifyWaitingList(ctx.db, addMinutes(NOW, 5), transport)).toBe(0);

      const freedAt = addMinutes(NOW, 10);
      await cancelReservation(ctx.db, taken.reservationId, "guest", freedAt, "Cancelled by guest");
      expect(await notifyWaitingList(ctx.db, freedAt, transport)).toBe(1);
      expect(outbox.map((email) => email.to)).toEqual(["first@example.com"]);
      expect(outbox[0].subject).toContain("A table has become free");
      expect(outbox[0].text).toContain("https://example.test/en/reserve?date=2027-08-12&time=20%3A00&guests=2");
      expect(outbox[0].text).toContain("It is not held for you.");

      // Within two hours the others wait their turn.
      expect(await notifyWaitingList(ctx.db, addMinutes(freedAt, RENOTIFY_MINUTES - 1), transport)).toBe(0);
      expect(await notifyWaitingList(ctx.db, addMinutes(freedAt, RENOTIFY_MINUTES + 1), transport)).toBe(1);
      expect(outbox.map((email) => email.to)).toEqual(["first@example.com", "second@example.com"]);

      // The second guest books: marked as booked, and with the evening full again the third is not told.
      await book({ email: "second@example.com" }, { table: 28, now: addMinutes(freedAt, RENOTIFY_MINUTES + 5) });
      expect(await notifyWaitingList(ctx.db, addMinutes(freedAt, 3 * RENOTIFY_MINUTES), transport)).toBe(0);
      const statuses = (await listWaiting(ctx.db, DATE)).map((entry) => [entry.email, entry.status]);
      expect(statuses).toEqual([
        ["first@example.com", "NOTIFIED"],
        ["second@example.com", "BOOKED"],
        ["third@example.com", "WAITING"],
      ]);

      // Staff may still email anyone by hand.
      const third = (await listWaiting(ctx.db, DATE))[2];
      await notifyWaitingEntry(ctx.db, third.id, MANAGER, addMinutes(freedAt, 3 * RENOTIFY_MINUTES), transport);
      expect(outbox.at(-1)?.to).toBe("third@example.com");
    });

    it("is emptied the day after the evening, and limits how often one address may join", async () => {
      await onlyTable28();
      await book({ email: "anna@example.com" }, { table: 28 });
      await join("first@example.com");
      expect(await purgeWaitingList(ctx.db, new Date("2027-08-12T21:30:00Z"))).toBe(0);
      expect(await purgeWaitingList(ctx.db, new Date("2027-08-13T08:00:00Z"))).toBe(1);
      expect(await ctx.db.select().from(schema.waitingEntry)).toHaveLength(0);

      for (let attempt = 0; attempt < JOIN_ATTEMPTS; attempt++) expect(await mayJoin(ctx.db, "hash", NOW)).toBe(true);
      expect(await mayJoin(ctx.db, "hash", NOW)).toBe(false);
      expect(await mayJoin(ctx.db, "another", NOW)).toBe(true);
      expect(await mayJoin(ctx.db, "hash", addMinutes(NOW, 16))).toBe(true);
    });
  });

  describe("the thank-you with the review links", () => {
    // 11:00 in Corfu on the morning after DATE.
    const MORNING_AFTER = new Date("2027-08-13T08:00:00Z");
    const withLinks = () =>
      ctx.db.update(schema.restaurantSettings).set({ reviewUrlGoogle: "https://g.example/review", reviewUrlTripadvisor: "https://t.example/review" });

    it("goes once to guests who came, the morning after, and never without a link", async () => {
      const came = await book({ email: "anna@example.com" });
      const missed = await book({ email: "noshow@example.com" }, { table: 2 });
      await setStatus(came.reservationId, "COMPLETED");
      await setStatus(missed.reservationId, "NO_SHOW");

      // No link entered yet: nothing is sent.
      expect(await sendReviewRequests(ctx.db, MORNING_AFTER, transport)).toBe(0);
      await withLinks();
      // Not in the middle of the night.
      expect(await sendReviewRequests(ctx.db, new Date("2027-08-13T03:00:00Z"), transport)).toBe(0);

      expect(await sendReviewRequests(ctx.db, MORNING_AFTER, transport)).toBe(1);
      expect(outbox.map((email) => email.to)).toEqual(["anna@example.com"]);
      expect(outbox[0].subject).toBe("Thank you for dining with us");
      expect(outbox[0].text).toContain("Review us on Google: https://g.example/review");
      expect(outbox[0].text).toContain("Review us on Tripadvisor: https://t.example/review");
      expect(await sendReviewRequests(ctx.db, addMinutes(MORNING_AFTER, 60), transport)).toBe(0);
    });

    it("does not ask the same guest again within a year", async () => {
      await withLinks();
      const first = await book({ email: "anna@example.com" });
      await setStatus(first.reservationId, "COMPLETED");
      expect(await sendReviewRequests(ctx.db, MORNING_AFTER, transport)).toBe(1);

      const again = await book({ email: "anna@example.com" }, { date: "2027-08-19", now: new Date("2027-08-14T10:00:00Z") });
      await setStatus(again.reservationId, "COMPLETED");
      expect(await sendReviewRequests(ctx.db, new Date("2027-08-20T08:00:00Z"), transport)).toBe(0);
      expect(outbox).toHaveLength(1);
    });
  });

  describe("exports", () => {
    it("lists the reservations of a period with their money, notes and occasion", async () => {
      const kept = await book({ name: "Άννα Παπαδοπούλου", email: "anna@example.com", phone: "+30 690 111 2222", occasion: "BIRTHDAY", notes: "Window; quiet" });
      await saveReservationNote(ctx.db, kept.reservationId, "Cake", MANAGER);
      await book({ email: "later@example.com" }, { date: "2027-08-14" });

      const rows = await exportReservations(ctx.db, { from: DATE, to: "2027-08-13" });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        date: DATE,
        time: "20:00",
        partySize: 2,
        tableNumbers: [1],
        guestName: "Άννα Παπαδοπούλου",
        status: "CONFIRMED",
        source: "ONLINE",
        occasion: "BIRTHDAY",
        depositCents: 12000,
        tableFeeCents: 5000,
        totalCents: 17000,
        refundedCents: 0,
        guestNotes: "Window; quiet",
        staffNotes: "Cake",
        bookedOn: "2027-08-01",
      });
    });

    it("writes a file Excel reads: semicolons, quoted text, no formulas from guests", () => {
      const csv = toCsv([
        ["Name", "Total (€)", "Note"],
        ["Άννα", csvMoney(17000), 'Window; "quiet"'],
        ["=HYPERLINK(1)", 2, "+30 690 111 2222"],
        [null, "", "two\nlines"],
      ]);
      expect(csv.startsWith("﻿")).toBe(true);
      expect(csv.slice(1).split("\r\n")).toEqual([
        "Name;Total (€);Note",
        'Άννα;170,00;"Window; ""quiet"""',
        "'=HYPERLINK(1);2;'+30 690 111 2222",
        ';;"two\nlines"',
        "",
      ]);
    });

    it("accepts only a sensible period", () => {
      expect(exportRange("2027-08-01", "2027-08-31")).toEqual({ from: "2027-08-01", to: "2027-08-31" });
      expect(exportRange("2027-08-31", "2027-08-01")).toBeNull();
      expect(exportRange("2026-01-01", "2027-08-01")).toBeNull();
      expect(exportRange("yesterday", "2027-08-01")).toBeNull();
      expect(exportRange(null, null)).toBeNull();
    });
  });
});
