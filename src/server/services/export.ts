import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { ReservationStatus } from "@/domain/reservation-state";
import { addMinutes, zonedDate, zonedTime, zonedToInstant } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { loadSettings, type Db } from "./context";

/** What the manager's downloads contain. The Excel file itself is written by xlsx.ts. */

const DAY_MINUTES = 24 * 60;
/** Longest period in one file. */
export const MAX_EXPORT_DAYS = 366;
/** "12/08/2027" */
export const sheetDate = (date: string): string => date.split("-").reverse().join("/");

/** from..to as given if both are dates in order and no longer than the limit; otherwise null. */
export function exportRange(from: string | null, to: string | null): { from: string; to: string } | null {
  const isDate = (value: string | null): value is string => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isDate(from) || !isDate(to) || from > to) return null;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (DAY_MINUTES * 60_000);
  return Number.isFinite(days) && days < MAX_EXPORT_DAYS ? { from, to } : null;
}

export interface ExportedReservation {
  reference: string;
  /** YYYY-MM-DD and HH:mm in the restaurant's timezone. */
  date: string;
  time: string;
  partySize: number;
  tableNumbers: number[];
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  status: ReservationStatus;
  source: "ONLINE" | "STAFF";
  selectionMode: "AUTO" | "CHOSEN";
  occasion: schema.Occasion | null;
  depositCents: number;
  tableFeeCents: number;
  totalCents: number;
  refundedCents: number;
  guestNotes: string;
  staffNotes: string;
  bookedOn: string;
}

const BOOKED: ReservationStatus[] = ["CONFIRMED", "LATE", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"];

/** Every booked reservation with a visit date from..to inclusive, in date and time order. */
export async function exportReservations(db: Db, range: { from: string; to: string }): Promise<ExportedReservation[]> {
  const settings = await loadSettings(db);
  const start = zonedToInstant(range.from, "00:00", settings.timezone);
  const end = addMinutes(zonedToInstant(range.to, "00:00", settings.timezone), DAY_MINUTES);
  const inRange = and(gte(schema.reservation.startsAt, start), lt(schema.reservation.startsAt, end), inArray(schema.reservation.status, BOOKED));

  const [rows, allocations, payments] = await Promise.all([
    db
      .select({ reservation: schema.reservation, customer: schema.customer })
      .from(schema.reservation)
      .leftJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
      .where(inRange)
      .orderBy(asc(schema.reservation.startsAt), asc(schema.reservation.reference)),
    db
      .selectDistinct({ reservationId: schema.tableAllocation.reservationId, number: schema.diningTable.number })
      .from(schema.tableAllocation)
      .innerJoin(schema.reservation, eq(schema.tableAllocation.reservationId, schema.reservation.id))
      .innerJoin(schema.diningTable, eq(schema.tableAllocation.tableId, schema.diningTable.id))
      .where(inRange),
    db
      .select({ reservationId: schema.payment.reservationId, refundedCents: schema.payment.refundedCents })
      .from(schema.payment)
      .innerJoin(schema.reservation, eq(schema.payment.reservationId, schema.reservation.id))
      .where(inRange),
  ]);

  return rows.map(({ reservation, customer }) => ({
    reference: reservation.reference,
    date: zonedDate(reservation.startsAt, settings.timezone),
    time: zonedTime(reservation.startsAt, settings.timezone),
    partySize: reservation.partySize,
    tableNumbers: allocations
      .filter((allocation) => allocation.reservationId === reservation.id)
      .map((allocation) => allocation.number)
      .sort((a, b) => a - b),
    guestName: customer?.name ?? "",
    guestPhone: customer?.phone ?? "",
    guestEmail: customer && !customer.anonymisedAt ? customer.email : "",
    status: reservation.status,
    source: reservation.source,
    selectionMode: reservation.selectionMode,
    occasion: reservation.occasion,
    depositCents: reservation.depositCents,
    tableFeeCents: reservation.tableFeeCents,
    totalCents: reservation.totalCents,
    refundedCents: payments
      .filter((payment) => payment.reservationId === reservation.id)
      .reduce((total, payment) => total + payment.refundedCents, 0),
    guestNotes: reservation.guestNotes ?? "",
    staffNotes: reservation.staffNotes ?? "",
    bookedOn: zonedDate(reservation.createdAt, settings.timezone),
  }));
}
