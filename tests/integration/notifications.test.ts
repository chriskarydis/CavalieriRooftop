import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { seedInitialConfiguration } from "@/server/db/seed-config";
import type { OutgoingEmail, SendResult } from "@/server/email/transport";
import { attachGuestDetails, confirmReservation, createHold } from "@/server/services/booking";
import { cancelReservation } from "@/server/services/floor-service";
import {
  listUnreadNotifications,
  markNotificationsRead,
  notifyReservationEvent,
  sendDueReminders,
} from "@/server/services/notifications";
import { openTestDatabase, resetTestDatabase } from "./test-db";

const DATE = "2027-08-12";
const AT_2000 = new Date("2027-08-12T17:00:00Z");
const BOOKED_AT = new Date("2027-08-01T10:00:00Z");
const RESTAURANT = "restaurant@example.com";
const GUEST_EMAIL = "maria@example.com";

describe("notifications", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;
  let tableId: Map<number, string>;
  let outbox: OutgoingEmail[];

  const transport = async (email: OutgoingEmail): Promise<SendResult> => {
    outbox.push(email);
    return { status: "SENT", providerId: `test-${outbox.length}` };
  };
  const book = async (locale: string, table = 1, now = BOOKED_AT) => {
    const held = await createHold(
      ctx.db,
      { date: DATE, time: "20:00", partySize: 2, selection: { mode: "TABLE", tableId: tableId.get(table)! }, locale },
      now,
    );
    await attachGuestDetails(
      ctx.db,
      held.reservationId,
      { name: "Maria <b>Test</b>", email: GUEST_EMAIL, phone: "+30 690 000 0000" },
      now,
    );
    await confirmReservation(ctx.db, held.reservationId, "system", now);
    return held;
  };
  const to = (address: string): OutgoingEmail[] => outbox.filter((email) => email.to === address);

  beforeAll(async () => {
    ctx = await openTestDatabase();
    process.env.RESTAURANT_NOTIFICATION_EMAIL = RESTAURANT;
    process.env.SITE_URL = "https://example.test";
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

  it("confirmation: guest email in the guest's language with the full breakdown and manage link", async () => {
    const held = await book("el");
    await notifyReservationEvent(ctx.db, held.reservationId, "CONFIRMED", { transport });

    const [guest] = to(GUEST_EMAIL);
    expect(guest.subject).toBe(`Η κράτησή σας ${held.reference} επιβεβαιώθηκε`);
    expect(guest.text).toContain("Τραπέζι: 1");
    expect(guest.text).toContain("Άτομα: 2");
    expect(guest.text).toContain("20:00");
    expect(guest.text).toContain("12/08/2027");
    expect(guest.text).toContain("Προκαταβολή (ελάχιστη κατανάλωση): 120,00");
    expect(guest.text).toContain("Χρέωση επιλογής τραπεζιού: 50,00");
    expect(guest.text).toContain("Σύνολο πληρωμής: 170,00");
    expect(guest.text).toContain("Αφαιρείται από τον λογαριασμό σας: 120,00");
    expect(guest.text).toContain(`https://example.test/el/reservation/${held.manageToken}`);
    expect(guest.text).toContain("Kapodistriou 4");
    expect(guest.text).toContain("24 ώρες");
    expect(guest.html).toContain(`/el/reservation/${held.manageToken}`);
  });

  it("escapes guest-supplied text in the HTML", async () => {
    const held = await book("en");
    await notifyReservationEvent(ctx.db, held.reservationId, "CONFIRMED", { transport });
    const [guest] = to(GUEST_EMAIL);
    expect(guest.html).toContain("Maria &lt;b&gt;Test&lt;/b&gt;");
    expect(guest.html).not.toContain("<b>Test</b>");
  });

  it("restaurant email is in English, has the phone but not the guest's email or manage link", async () => {
    const held = await book("el");
    await notifyReservationEvent(ctx.db, held.reservationId, "CONFIRMED", { transport });
    const [restaurant] = to(RESTAURANT);
    expect(restaurant.subject).toContain(`New reservation ${held.reference}`);
    expect(restaurant.text).toContain("Phone: +30 690 000 0000");
    expect(restaurant.text).toContain("Table: 1");
    expect(restaurant.text).not.toContain(GUEST_EMAIL);
    expect(restaurant.text).not.toContain(held.manageToken);
  });

  it("sends each email once even when the event is reported again", async () => {
    const held = await book("en");
    await notifyReservationEvent(ctx.db, held.reservationId, "CONFIRMED", { transport });
    await notifyReservationEvent(ctx.db, held.reservationId, "CONFIRMED", { transport });
    expect(outbox).toHaveLength(2);
    const log = await ctx.db.select().from(schema.emailLog);
    expect(log.map((row) => row.status)).toEqual(["SENT", "SENT"]);
  });

  it("cancellation email states the refund, or that there is none", async () => {
    const early = await book("en", 1);
    const refunded = await cancelReservation(ctx.db, early.reservationId, "guest", new Date("2027-08-10T10:00:00Z"));
    await notifyReservationEvent(ctx.db, early.reservationId, "CANCELLED", {
      refundCents: refunded.outcome.refundCents,
      transport,
    });
    expect(to(GUEST_EMAIL)[0].text).toContain("€170.00 will be refunded");
    expect(to(RESTAURANT)[0].text).toContain("Refund due under the policy: €170.00");

    outbox = [];
    const late = await book("en", 2);
    const kept = await cancelReservation(ctx.db, late.reservationId, "guest", addMinutes(AT_2000, -60));
    await notifyReservationEvent(ctx.db, late.reservationId, "CANCELLED", { refundCents: kept.outcome.refundCents, transport });
    expect(to(GUEST_EMAIL)[0].text).toContain("the amount paid is not refunded");
  });

  it("no-show goes to the restaurant only", async () => {
    const held = await book("en");
    await notifyReservationEvent(ctx.db, held.reservationId, "NO_SHOW", { transport });
    expect(to(GUEST_EMAIL)).toHaveLength(0);
    expect(to(RESTAURANT)[0].subject).toContain("No-show");
  });

  it("reminder: once, within 24 hours, and not for last-minute bookings", async () => {
    await book("en", 1);
    expect(await sendDueReminders(ctx.db, addMinutes(AT_2000, -25 * 60), transport)).toBe(0);
    expect(await sendDueReminders(ctx.db, addMinutes(AT_2000, -23 * 60), transport)).toBe(1);
    expect(await sendDueReminders(ctx.db, addMinutes(AT_2000, -22 * 60), transport)).toBe(0);
    expect(to(GUEST_EMAIL)[0].subject).toContain("Reminder");

    // Booked three hours before: the confirmation is the reminder.
    await book("en", 2, addMinutes(AT_2000, -180));
    expect(await sendDueReminders(ctx.db, addMinutes(AT_2000, -120), transport)).toBe(0);
  });

  it("a failed send is recorded and does not throw", async () => {
    const held = await book("en");
    const failing = async (): Promise<SendResult> => {
      throw new Error("Email provider answered 500");
    };
    await notifyReservationEvent(ctx.db, held.reservationId, "CONFIRMED", { transport: failing });
    const log = await ctx.db.select().from(schema.emailLog).where(eq(schema.emailLog.template, "guest_confirmation"));
    expect(log[0]).toMatchObject({ status: "FAILED", error: "Email provider answered 500" });
  });

  it("dashboard notifications list new events without contact details and can be cleared", async () => {
    const held = await book("en");
    await notifyReservationEvent(ctx.db, held.reservationId, "CONFIRMED", { transport });
    const [notification] = await listUnreadNotifications(ctx.db);
    expect(notification).toMatchObject({ type: "CONFIRMED", reference: held.reference, partySize: 2, tableNumbers: [1] });
    expect(JSON.stringify(notification)).not.toContain(GUEST_EMAIL);
    expect(JSON.stringify(notification)).not.toContain("+30 690");

    await markNotificationsRead(ctx.db);
    expect(await listUnreadNotifications(ctx.db)).toHaveLength(0);
  });
});
