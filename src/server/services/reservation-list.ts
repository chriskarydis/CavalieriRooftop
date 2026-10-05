import { and, asc, eq, gte, ilike, inArray, isNull, lt, or } from "drizzle-orm";
import { addMinutes, zonedToInstant } from "@/domain/time";
import type { ReservationStatus } from "@/domain/reservation-state";
import * as schema from "@/server/db/schema";
import { loadSettings, type Db } from "./context";

const DAY_MINUTES = 24 * 60;
const MAX_ROWS = 300;

export interface ReservationListItem {
  id: string;
  reference: string;
  startsAt: Date;
  partySize: number;
  status: ReservationStatus;
  source: "ONLINE" | "STAFF";
  selectionMode: "AUTO" | "CHOSEN";
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  notes: string | null;
  depositCents: number;
  tableFeeCents: number;
  totalCents: number;
  /** Tables currently allocated; empty once released (cancelled, no-show, completed). */
  tableNumbers: number[];
}

export interface ReservationFilter {
  /** Service date, YYYY-MM-DD in the restaurant's timezone. */
  date: string;
  status?: ReservationStatus;
  /** Matches guest name, email, phone or reference. */
  search?: string;
}

/** Reservations for one service date, earliest first. Unpaid holds and expired holds are left out. */
export async function listReservations(db: Db, filter: ReservationFilter): Promise<ReservationListItem[]> {
  const settings = await loadSettings(db);
  const dayStart = zonedToInstant(filter.date, "00:00", settings.timezone);
  const search = filter.search?.trim();
  const pattern = search ? `%${search.replace(/[%_\\]/g, "\\$&")}%` : null;

  const rows = await db
    .select({ reservation: schema.reservation, customer: schema.customer })
    .from(schema.reservation)
    .leftJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
    .where(
      and(
        gte(schema.reservation.startsAt, dayStart),
        lt(schema.reservation.startsAt, addMinutes(dayStart, DAY_MINUTES)),
        filter.status
          ? eq(schema.reservation.status, filter.status)
          : inArray(schema.reservation.status, ["CONFIRMED", "LATE", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
        pattern
          ? or(
              ilike(schema.customer.name, pattern),
              ilike(schema.customer.email, pattern),
              ilike(schema.customer.phone, pattern),
              ilike(schema.reservation.reference, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(asc(schema.reservation.startsAt), asc(schema.reservation.reference))
    .limit(MAX_ROWS);
  if (rows.length === 0) return [];

  const tables = await db
    .select({ reservationId: schema.tableAllocation.reservationId, number: schema.diningTable.number })
    .from(schema.tableAllocation)
    .innerJoin(schema.diningTable, eq(schema.tableAllocation.tableId, schema.diningTable.id))
    .where(
      and(
        inArray(
          schema.tableAllocation.reservationId,
          rows.map((row) => row.reservation.id),
        ),
        isNull(schema.tableAllocation.releasedAt),
      ),
    );

  return rows.map(({ reservation, customer }) => ({
    id: reservation.id,
    reference: reservation.reference,
    startsAt: reservation.startsAt,
    partySize: reservation.partySize,
    status: reservation.status,
    source: reservation.source,
    selectionMode: reservation.selectionMode,
    guestName: customer?.name ?? null,
    guestPhone: customer?.phone ?? null,
    guestEmail: customer?.email ?? null,
    notes: reservation.staffNotes ?? reservation.guestNotes,
    depositCents: reservation.depositCents,
    tableFeeCents: reservation.tableFeeCents,
    totalCents: reservation.totalCents,
    tableNumbers: tables
      .filter((table) => table.reservationId === reservation.id)
      .map((table) => table.number)
      .sort((a, b) => a - b),
  }));
}
