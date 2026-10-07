import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { ReservationStatus } from "@/domain/reservation-state";
import { addMinutes, zonedDate, zonedTime, zonedToInstant } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { loadSettings, type Db } from "./context";

/**
 * Files for the restaurant's own spreadsheets. They are written the way
 * Excel opens them on a computer set up for Greece: columns separated by a
 * semicolon, amounts with a decimal comma, dates as dd/mm/yyyy, and a mark at
 * the start that tells Excel the text is UTF-8 so Greek names read correctly.
 */

const DAY_MINUTES = 24 * 60;
/** Longest period in one file. */
export const MAX_EXPORT_DAYS = 366;
const SEPARATOR = ";";
const BYTE_ORDER_MARK = "﻿";

export type Cell = string | number | null;

/**
 * A cell that starts like a formula is written as plain text, so a name typed
 * by a guest can never run as a formula when the file is opened.
 */
function cell(value: Cell): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Cell[][]): string {
  return BYTE_ORDER_MARK + rows.map((row) => row.map(cell).join(SEPARATOR)).join("\r\n") + "\r\n";
}

/** 6000 cents as "60,00". */
export const csvMoney = (cents: number): string => (cents / 100).toFixed(2).replace(".", ",");

/** "12/08/2027" */
export const csvDate = (date: string): string => date.split("-").reverse().join("/");

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
