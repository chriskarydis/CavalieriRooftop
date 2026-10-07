import { asc, eq } from "drizzle-orm";
import { SITE, siteUrl } from "@/config/site";
import type { CalendarEntry } from "@/domain/calendar";
import { cancellationOutcome, type CancellationOutcome } from "@/domain/cancellation";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { hashManageToken } from "./booking";
import { loadSettings, type Db, type ReservationRow, type Settings } from "./context";

export interface GuestReservation {
  reservation: ReservationRow;
  customer: { name: string; email: string; phone: string | null } | null;
  /** The reservation's tables, ascending: those it holds now, or its last ones once it is over. */
  tableNumbers: number[];
  settings: Settings;
  /** The table is still held for this unpaid reservation. */
  holdActive: boolean;
  /** What cancelling right now would refund. */
  cancellation: CancellationOutcome;
}

/**
 * The tables a reservation has now. Once every allocation is released (the
 * reservation was cancelled or is over), the tables it had last.
 */
export function currentTableNumbers(rows: Array<{ number: number; releasedAt: Date | null }>): number[] {
  const active = rows.filter((row) => row.releasedAt === null);
  if (active.length > 0) return [...new Set(active.map((row) => row.number))].sort((a, b) => a - b);
  const last = Math.max(0, ...rows.map((row) => row.releasedAt?.getTime() ?? 0));
  return [...new Set(rows.filter((row) => row.releasedAt?.getTime() === last).map((row) => row.number))].sort((a, b) => a - b);
}

/**
 * Looks a reservation up by the secret token from the guest's link. The
 * reference number alone is never enough to open a reservation.
 */
export async function getReservationByToken(db: Db, token: string, now = new Date()): Promise<GuestReservation | null> {
  if (!token) return null;
  const [row] = await db
    .select({ reservation: schema.reservation, customer: schema.customer })
    .from(schema.reservation)
    .leftJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
    .where(eq(schema.reservation.manageTokenHash, hashManageToken(token)));
  if (!row) return null;

  const [tables, settings] = await Promise.all([
    db
      .select({ number: schema.diningTable.number, releasedAt: schema.tableAllocation.releasedAt })
      .from(schema.tableAllocation)
      .innerJoin(schema.diningTable, eq(schema.tableAllocation.tableId, schema.diningTable.id))
      .where(eq(schema.tableAllocation.reservationId, row.reservation.id))
      .orderBy(asc(schema.diningTable.number)),
    loadSettings(db),
  ]);

  return {
    reservation: row.reservation,
    customer: row.customer
      ? { name: row.customer.name, email: row.customer.email, phone: row.customer.phone }
      : null,
    tableNumbers: currentTableNumbers(tables),
    settings,
    holdActive:
      row.reservation.status === "PENDING_PAYMENT" &&
      row.reservation.holdExpiresAt !== null &&
      row.reservation.holdExpiresAt.getTime() > now.getTime(),
    cancellation: cancellationOutcome({
      startsAt: row.reservation.startsAt,
      now,
      refundCutoffHours: settings.refundCutoffHours,
      paidCents: row.reservation.totalCents,
    }),
  };
}

/**
 * The reservation as an entry for the guest's own calendar. `t` reads the
 * "email.calendar" messages in the guest's language.
 */
export function calendarEntryFor(
  found: GuestReservation,
  locale: string,
  token: string,
  t: (key: "title" | "description", values: Record<string, string | number>) => string,
): CalendarEntry {
  const { reservation, settings } = found;
  return {
    uid: `${reservation.reference}@cavalieriroofgarden`,
    title: t("title", { name: SITE.name }),
    description: t("description", {
      reference: reservation.reference,
      guests: reservation.partySize,
      url: `${siteUrl()}/${locale}/reservation/${token}`,
    }),
    location: `${SITE.name}, ${SITE.street}, ${SITE.postalCode} ${SITE.city.en}`,
    startsAt: reservation.startsAt,
    endsAt: addMinutes(reservation.startsAt, settings.diningMinutes),
  };
}
