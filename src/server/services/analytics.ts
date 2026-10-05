import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { addMinutes, isoWeekday, zonedDate, zonedTime, zonedToInstant } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { loadSettings, type Db } from "./context";

/**
 * Figures for the manager, for service dates from..to inclusive. Everything is
 * counted from reservations that were paid for (confirmed at some point), so
 * abandoned checkouts never inflate the numbers.
 */

const DAY_MINUTES = 24 * 60;
const BOOKED: schema.ReservationStatusValue[] = ["CONFIRMED", "LATE", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"];
/** Reservations that take, or took, a table: not cancelled and not a no-show. */
const HONOURED: schema.ReservationStatusValue[] = ["CONFIRMED", "LATE", "SEATED", "COMPLETED"];

export interface CountRow {
  label: string;
  count: number;
}

export interface Analytics {
  reservations: number;
  /** Guests on reservations that were not cancelled and not a no-show. */
  covers: number;
  averagePartySize: number;
  cancellations: number;
  noShows: number;
  /** Share of booked reservations that ended as a no-show, 0..1. */
  noShowRate: number;
  /** Deposits on honoured reservations: credited to guests' bills. */
  depositCents: number;
  /** Table selection fees on honoured reservations: revenue beyond the bill. */
  tableFeeCents: number;
  /** Paid online and kept from cancellations and no-shows, after refunds. */
  retainedCents: number;
  refundedCents: number;
  /** Guest picked the table, as opposed to "let us choose". */
  chosenTable: number;
  autoAssigned: number;
  walkIns: number;
  walkInCovers: number;
  walkInsForDrinks: number;
  /** Honoured reservations by start time (HH:mm), in time order. */
  byHour: CountRow[];
  /** Honoured covers by ISO weekday 1..7. */
  coversByWeekday: Array<{ weekday: number; covers: number }>;
  /** Tables guests chose most, highest first. */
  chosenTables: Array<{ tableNumber: number; count: number; feeCents: number }>;
  /** Table fee revenue by category name as booked. */
  feeByCategory: Array<{ category: string; count: number; feeCents: number }>;
  /** Share of table-evenings that had at least one honoured reservation, 0..1. */
  tableUse: number;
}

const TOP_TABLES = 10;

export async function getAnalytics(db: Db, range: { from: string; to: string }): Promise<Analytics> {
  const settings = await loadSettings(db);
  const start = zonedToInstant(range.from, "00:00", settings.timezone);
  const end = addMinutes(zonedToInstant(range.to, "00:00", settings.timezone), DAY_MINUTES);
  const inRange = and(gte(schema.reservation.startsAt, start), lt(schema.reservation.startsAt, end));

  const [reservations, payments, chosenAllocations, walkIns, activeTables] = await Promise.all([
    db
      .select()
      .from(schema.reservation)
      .where(and(inRange, inArray(schema.reservation.status, BOOKED))),
    db
      .select({ reservationId: schema.payment.reservationId, refundedCents: schema.payment.refundedCents })
      .from(schema.payment)
      .innerJoin(schema.reservation, eq(schema.payment.reservationId, schema.reservation.id))
      .where(inRange),
    db
      .selectDistinct({
        reservationId: schema.tableAllocation.reservationId,
        tableNumber: schema.diningTable.number,
        tableId: schema.tableAllocation.tableId,
      })
      .from(schema.tableAllocation)
      .innerJoin(schema.reservation, eq(schema.tableAllocation.reservationId, schema.reservation.id))
      .innerJoin(schema.diningTable, eq(schema.tableAllocation.tableId, schema.diningTable.id))
      .where(and(inRange, inArray(schema.reservation.status, HONOURED), isNotNull(schema.tableAllocation.reservationId))),
    db
      .select()
      .from(schema.walkIn)
      .where(and(gte(schema.walkIn.arrivedAt, start), lt(schema.walkIn.arrivedAt, end), sql`${schema.walkIn.status} <> 'CANCELLED'`)),
    db.select({ id: schema.diningTable.id }).from(schema.diningTable).where(eq(schema.diningTable.status, "ACTIVE")),
  ]);

  const honoured = reservations.filter((reservation) => HONOURED.includes(reservation.status));
  const lost = reservations.filter((reservation) => !HONOURED.includes(reservation.status));
  const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);
  const refundedById = new Map(payments.map((payment) => [payment.reservationId, payment.refundedCents]));
  const refundedCents = sum(payments.map((payment) => payment.refundedCents));
  const covers = sum(honoured.map((reservation) => reservation.partySize));

  const hours = new Map<string, number>();
  const weekdays = new Map<number, number>();
  const serviceDates = new Set<string>();
  for (const reservation of honoured) {
    const time = zonedTime(reservation.startsAt, settings.timezone);
    hours.set(time, (hours.get(time) ?? 0) + 1);
    const date = zonedDate(reservation.startsAt, settings.timezone);
    serviceDates.add(date);
    weekdays.set(isoWeekday(date), (weekdays.get(isoWeekday(date)) ?? 0) + reservation.partySize);
  }

  // A table counts once per reservation, and only for reservations where the guest chose it.
  const chosenIds = new Set(honoured.filter((r) => r.selectionMode === "CHOSEN").map((r) => r.id));
  const feeById = new Map(honoured.map((reservation) => [reservation.id, reservation.tableFeeCents]));
  const tableCounts = new Map<number, { count: number; feeCents: number }>();
  const usedTableEvenings = new Set<string>();
  const dateById = new Map(honoured.map((r) => [r.id, zonedDate(r.startsAt, settings.timezone)]));
  for (const allocation of chosenAllocations) {
    if (!allocation.reservationId) continue;
    usedTableEvenings.add(`${allocation.tableId}:${dateById.get(allocation.reservationId)}`);
    if (!chosenIds.has(allocation.reservationId)) continue;
    const entry = tableCounts.get(allocation.tableNumber) ?? { count: 0, feeCents: 0 };
    entry.count += 1;
    entry.feeCents += feeById.get(allocation.reservationId) ?? 0;
    tableCounts.set(allocation.tableNumber, entry);
  }

  const categories = new Map<string, { count: number; feeCents: number }>();
  for (const reservation of honoured) {
    if (reservation.tableFeeCents === 0 || !reservation.tableCategoryName) continue;
    const entry = categories.get(reservation.tableCategoryName) ?? { count: 0, feeCents: 0 };
    entry.count += 1;
    entry.feeCents += reservation.tableFeeCents;
    categories.set(reservation.tableCategoryName, entry);
  }

  const possibleTableEvenings = activeTables.length * serviceDates.size;
  return {
    reservations: reservations.length,
    covers,
    averagePartySize: honoured.length === 0 ? 0 : covers / honoured.length,
    cancellations: reservations.filter((reservation) => reservation.status === "CANCELLED").length,
    noShows: reservations.filter((reservation) => reservation.status === "NO_SHOW").length,
    noShowRate:
      reservations.length === 0
        ? 0
        : reservations.filter((reservation) => reservation.status === "NO_SHOW").length / reservations.length,
    depositCents: sum(honoured.map((reservation) => reservation.depositCents)),
    tableFeeCents: sum(honoured.map((reservation) => reservation.tableFeeCents)),
    retainedCents: sum(lost.map((reservation) => Math.max(0, reservation.totalCents - (refundedById.get(reservation.id) ?? 0)))),
    refundedCents,
    chosenTable: honoured.filter((reservation) => reservation.selectionMode === "CHOSEN").length,
    autoAssigned: honoured.filter((reservation) => reservation.selectionMode === "AUTO").length,
    walkIns: walkIns.length,
    walkInCovers: sum(walkIns.map((walkIn) => walkIn.partySize)),
    walkInsForDrinks: walkIns.filter((walkIn) => walkIn.kind === "DRINKS").length,
    byHour: [...hours.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, count })),
    coversByWeekday: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, covers: weekdays.get(weekday) ?? 0 })),
    chosenTables: [...tableCounts.entries()]
      .map(([tableNumber, entry]) => ({ tableNumber, ...entry }))
      .sort((a, b) => b.count - a.count || a.tableNumber - b.tableNumber)
      .slice(0, TOP_TABLES),
    feeByCategory: [...categories.entries()]
      .map(([category, entry]) => ({ category, ...entry }))
      .sort((a, b) => b.feeCents - a.feeCents),
    tableUse: possibleTableEvenings === 0 ? 0 : usedTableEvenings.size / possibleTableEvenings,
  };
}
