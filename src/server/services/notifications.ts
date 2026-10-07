import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { addMinutes, zonedTime } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { renderEmail, type EmailData, type EmailTemplate } from "@/server/email/templates";
import { sendEmail, type EmailTransport } from "@/server/email/transport";
import { manageTokenFor } from "./booking";
import { currentTableNumbers } from "./guest-reservation";
import { loadSettings, type Db } from "./context";

/**
 * Tells the guest and the restaurant about reservation events: emails, plus a
 * notification on the dashboard. Called after the reservation change has been
 * committed. A failure here is recorded and never undoes the reservation.
 */

export type ReservationEventKind = "CONFIRMED" | "CANCELLED" | "CANCELLED_BY_RESTAURANT" | "NO_SHOW" | "REMINDER" | "RESCHEDULED" | "CHANGED_BY_STAFF" | "CREATED_BY_STAFF";

const PLAN: Record<
  ReservationEventKind,
  /** repeatable: can happen more than once per reservation, so each occurrence gets its own emails. */
  { guest?: EmailTemplate; restaurant?: EmailTemplate; dashboard: boolean; repeatable?: boolean }
> = {
  CONFIRMED: { guest: "guest_confirmation", restaurant: "restaurant_new", dashboard: true },
  CANCELLED: { guest: "guest_cancellation", restaurant: "restaurant_cancelled", dashboard: true },
  // The restaurant closed that day and cancelled it itself: only the guest needs an email.
  CANCELLED_BY_RESTAURANT: { guest: "guest_cancellation", dashboard: true },
  NO_SHOW: { restaurant: "restaurant_no_show", dashboard: true },
  REMINDER: { guest: "guest_reminder", dashboard: false },
  RESCHEDULED: { guest: "guest_rescheduled", restaurant: "restaurant_rescheduled", dashboard: true, repeatable: true },
  // Staff made the change themselves: the guest is told, the restaurant needs no email about its own action.
  CHANGED_BY_STAFF: { guest: "guest_rescheduled", dashboard: true, repeatable: true },
  // Taken by staff themselves: only the guest needs telling.
  CREATED_BY_STAFF: { guest: "guest_confirmation", dashboard: false },
};

async function loadEmailData(
  db: Db,
  reservationId: string,
  refundCents?: number,
): Promise<(EmailData & { guestEmail: string; guestErased: boolean }) | null> {
  const [row] = await db
    .select({ reservation: schema.reservation, customer: schema.customer })
    .from(schema.reservation)
    .innerJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
    .where(eq(schema.reservation.id, reservationId));
  if (!row) return null;

  const [tables, settings] = await Promise.all([
    db
      .select({ number: schema.diningTable.number, releasedAt: schema.tableAllocation.releasedAt })
      .from(schema.tableAllocation)
      .innerJoin(schema.diningTable, eq(schema.tableAllocation.tableId, schema.diningTable.id))
      .where(eq(schema.tableAllocation.reservationId, reservationId))
      .orderBy(asc(schema.diningTable.number)),
    loadSettings(db),
  ]);
  const { reservation, customer } = row;
  return {
    locale: reservation.locale,
    reference: reservation.reference,
    startsAt: reservation.startsAt,
    timezone: settings.timezone,
    partySize: reservation.partySize,
    tableNumbers: currentTableNumbers(tables),
    tableCategoryName: reservation.tableCategoryName,
    guestName: customer.name,
    guestPhone: customer.phone,
    guestEmail: customer.email,
    guestErased: customer.anonymisedAt !== null,
    occasion: reservation.occasion,
    guestNotes: reservation.guestNotes,
    diningMinutes: settings.diningMinutes,
    reviewLinks: { google: settings.reviewUrlGoogle, tripadvisor: settings.reviewUrlTripadvisor },
    depositCents: reservation.depositCents,
    tableFeeCents: reservation.tableFeeCents,
    totalCents: reservation.totalCents,
    creditTowardBillCents: reservation.creditTowardBillCents,
    graceMinutes: settings.graceMinutes,
    refundCutoffHours: settings.refundCutoffHours,
    manageToken: manageTokenFor(reservation.id),
    refundCents,
  };
}

/** Sends one email at most once per reservation and template, and records the outcome. */
async function deliver(
  db: Db,
  transport: EmailTransport,
  reservationId: string,
  template: EmailTemplate,
  recipient: string,
  data: EmailData,
  occurrence = "",
): Promise<void> {
  const claimed = await db
    .insert(schema.emailLog)
    .values({
      idempotencyKey: `${reservationId}:${template}${occurrence}`,
      template,
      recipient,
      locale: data.locale,
      reservationId,
      status: "PENDING",
    })
    .onConflictDoNothing()
    .returning({ id: schema.emailLog.id });
  if (claimed.length === 0) return;

  try {
    const result = await transport({ to: recipient, ...renderEmail(template, data) });
    await db
      .update(schema.emailLog)
      .set({ status: result.status, providerId: result.providerId })
      .where(eq(schema.emailLog.id, claimed[0].id));
  } catch (error) {
    await db
      .update(schema.emailLog)
      .set({ status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" })
      .where(eq(schema.emailLog.id, claimed[0].id));
  }
}

export async function notifyReservationEvent(
  db: Db,
  reservationId: string,
  kind: ReservationEventKind,
  options: { refundCents?: number; transport?: EmailTransport } = {},
): Promise<void> {
  const data = await loadEmailData(db, reservationId, options.refundCents);
  if (!data) return;
  if (kind === "CANCELLED_BY_RESTAURANT") data.closedByRestaurant = true;
  const plan = PLAN[kind];
  const transport = options.transport ?? sendEmail;

  if (plan.dashboard) {
    await db.insert(schema.notification).values({
      type: kind,
      reservationId,
      // Only what the dashboard list shows; no contact details.
      payload: {
        reference: data.reference,
        guestName: data.guestName,
        partySize: data.partySize,
        startsAt: data.startsAt.toISOString(),
        tableNumbers: data.tableNumbers,
      },
    });
  }
  const occurrence = plan.repeatable ? `:${data.startsAt.toISOString()}:${data.tableNumbers.join("+")}` : "";
  // Reservations taken by hand may have no address.
  if (plan.guest && data.guestEmail) await deliver(db, transport, reservationId, plan.guest, data.guestEmail, data, occurrence);

  const restaurantAddress = process.env.RESTAURANT_NOTIFICATION_EMAIL;
  if (plan.restaurant && restaurantAddress) {
    await deliver(db, transport, reservationId, plan.restaurant, restaurantAddress, data, occurrence);
  }
}

/** How long before the reservation the reminder goes out. */
export const REMINDER_HOURS = 24;

/**
 * Scheduled job: reminds guests whose confirmed reservation starts within the
 * next 24 hours. Reservations made inside that window get no reminder, since
 * the confirmation has only just been sent.
 */
export async function sendDueReminders(db: Db, now = new Date(), transport?: EmailTransport): Promise<number> {
  const horizon = addMinutes(now, REMINDER_HOURS * 60);
  const due = await db
    .select({ id: schema.reservation.id, startsAt: schema.reservation.startsAt, createdAt: schema.reservation.createdAt })
    .from(schema.reservation)
    .leftJoin(
      schema.emailLog,
      and(eq(schema.emailLog.reservationId, schema.reservation.id), eq(schema.emailLog.template, "guest_reminder")),
    )
    .where(
      and(
        eq(schema.reservation.status, "CONFIRMED"),
        gt(schema.reservation.startsAt, now),
        lt(schema.reservation.startsAt, horizon),
        isNull(schema.emailLog.id),
      ),
    );

  let sent = 0;
  for (const reservation of due) {
    const bookedInsideWindow = reservation.createdAt.getTime() > addMinutes(reservation.startsAt, -REMINDER_HOURS * 60).getTime();
    if (bookedInsideWindow) continue;
    await notifyReservationEvent(db, reservation.id, "REMINDER", { transport });
    sent++;
  }
  return sent;
}

/** The morning after: not before this many hours have passed since the reservation time. */
export const REVIEW_AFTER_HOURS = 10;
/** A request that could not go out within this many days is dropped. */
const REVIEW_WITHIN_DAYS = 3;
/** Sent during the day only, restaurant time: from this hour until before the other. */
const REVIEW_HOURS = { from: 10, until: 20 };
/** A returning guest is not asked again within this many days. */
export const REVIEW_REPEAT_DAYS = 365;

/**
 * Scheduled job: thanks guests who came and asks for a review, once per visit
 * and at most once a year per address. Sends nothing until the manager has
 * entered at least one review link in the settings.
 */
export async function sendReviewRequests(db: Db, now = new Date(), transport?: EmailTransport): Promise<number> {
  const settings = await loadSettings(db);
  if (!settings.reviewUrlGoogle && !settings.reviewUrlTripadvisor) return 0;
  const hour = Number(zonedTime(now, settings.timezone).slice(0, 2));
  if (hour < REVIEW_HOURS.from || hour >= REVIEW_HOURS.until) return 0;

  const due = await db
    .select({ id: schema.reservation.id, email: schema.customer.email })
    .from(schema.reservation)
    .innerJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
    .where(
      and(
        inArray(schema.reservation.status, ["SEATED", "COMPLETED"]),
        lt(schema.reservation.startsAt, addMinutes(now, -REVIEW_AFTER_HOURS * 60)),
        gt(schema.reservation.startsAt, addMinutes(now, -REVIEW_WITHIN_DAYS * 24 * 60)),
        isNull(schema.customer.anonymisedAt),
        sql`${schema.customer.email} LIKE '%@%'`,
      ),
    )
    .orderBy(asc(schema.reservation.startsAt));

  let sent = 0;
  for (const reservation of due) {
    const asked = await db
      .select({ id: schema.emailLog.id })
      .from(schema.emailLog)
      .where(
        and(
          eq(schema.emailLog.template, "guest_review"),
          eq(schema.emailLog.recipient, reservation.email),
          gt(schema.emailLog.createdAt, addMinutes(now, -REVIEW_REPEAT_DAYS * 24 * 60)),
        ),
      )
      .limit(1);
    if (asked.length > 0) continue;
    const data = await loadEmailData(db, reservation.id);
    if (!data) continue;
    await deliver(db, transport ?? sendEmail, reservation.id, "guest_review", data.guestEmail, data);
    sent++;
  }
  return sent;
}

// ── Dashboard notifications ─────────────────────────────────────────────────

export interface DashboardNotification {
  id: string;
  type: string;
  createdAt: Date;
  reference: string;
  guestName: string;
  partySize: number;
  startsAt: Date;
  tableNumbers: number[];
}

const MAX_SHOWN = 20;

export async function listUnreadNotifications(db: Db): Promise<DashboardNotification[]> {
  const rows = await db
    .select()
    .from(schema.notification)
    .where(isNull(schema.notification.readAt))
    .orderBy(desc(schema.notification.createdAt))
    .limit(MAX_SHOWN);
  return rows.map((row) => {
    const payload = row.payload as {
      reference: string;
      guestName: string;
      partySize: number;
      startsAt: string;
      tableNumbers: number[];
    };
    return { id: row.id, type: row.type, createdAt: row.createdAt, ...payload, startsAt: new Date(payload.startsAt) };
  });
}

export async function markNotificationsRead(db: Db, now = new Date()): Promise<void> {
  await db.update(schema.notification).set({ readAt: now }).where(isNull(schema.notification.readAt));
}

/** For the bell in the management header: how many are unread, and the newest new reservation among them. */
export async function notificationSummary(db: Db): Promise<{ count: number; latestId: string }> {
  const rows = await db
    .select({ id: schema.notification.id, type: schema.notification.type })
    .from(schema.notification)
    .where(isNull(schema.notification.readAt))
    .orderBy(desc(schema.notification.createdAt));
  return { count: rows.length, latestId: rows.find((row) => row.type === "CONFIRMED")?.id ?? "" };
}
