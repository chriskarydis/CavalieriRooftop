import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { deriveTableState, type LiveTableState } from "@/domain/table-state";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import type { Db } from "./context";

const LOOKAHEAD_MINUTES = 12 * 60;

export interface LiveBooking {
  allocationId: string;
  kind: "HOLD" | "RESERVATION" | "WALK_IN" | "BLOCK";
  startsAt: Date;
  endsAt: Date;
  reservationId: string | null;
  walkInId: string | null;
  reference: string | null;
  reservationStatus: schema.ReservationStatusValue | null;
  partySize: number | null;
  guestName: string | null;
  depositCents: number | null;
  tableFeeCents: number | null;
  notes: string | null;
}

export interface LiveTable {
  tableId: string;
  number: number;
  state: LiveTableState;
  /** Current and upcoming allocations for the rest of the service, earliest first. */
  bookings: LiveBooking[];
}

const NO_SHOW_LOOKBACK_MINUTES = 8 * 60;

export interface RecentNoShow {
  reservationId: string;
  reference: string;
  startsAt: Date;
  partySize: number;
  guestName: string | null;
  tableNumbers: number[];
}

/** Tonight's no-shows, so staff can still seat guests who turn up after all. */
export async function getRecentNoShows(db: Db, now = new Date()): Promise<RecentNoShow[]> {
  const rows = await db
    .select({ reservation: schema.reservation, guestName: schema.customer.name })
    .from(schema.reservation)
    .leftJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
    .where(
      and(
        eq(schema.reservation.status, "NO_SHOW"),
        gt(schema.reservation.startsAt, addMinutes(now, -NO_SHOW_LOOKBACK_MINUTES)),
      ),
    )
    .orderBy(asc(schema.reservation.startsAt));
  if (rows.length === 0) return [];

  const tables = await db
    .selectDistinct({ reservationId: schema.tableAllocation.reservationId, number: schema.diningTable.number })
    .from(schema.tableAllocation)
    .innerJoin(schema.diningTable, eq(schema.tableAllocation.tableId, schema.diningTable.id))
    .where(
      inArray(
        schema.tableAllocation.reservationId,
        rows.map((row) => row.reservation.id),
      ),
    );

  return rows.map(({ reservation, guestName }) => ({
    reservationId: reservation.id,
    reference: reservation.reference,
    startsAt: reservation.startsAt,
    partySize: reservation.partySize,
    guestName,
    tableNumbers: tables
      .filter((table) => table.reservationId === reservation.id)
      .map((table) => table.number)
      .sort((a, b) => a - b),
  }));
}

/** The state of every table right now, with tonight's bookings on it. */
export async function getLiveFloor(db: Db, now = new Date()): Promise<LiveTable[]> {
  const horizon = addMinutes(now, LOOKAHEAD_MINUTES);
  const [tables, rows] = await Promise.all([
    db.select().from(schema.diningTable).orderBy(asc(schema.diningTable.number)),
    db
      .select({
        allocationId: schema.tableAllocation.id,
        reason: schema.tableAllocation.reason,
        tableId: schema.tableAllocation.tableId,
        kind: schema.tableAllocation.kind,
        startsAt: sql<string>`lower(${schema.tableAllocation.period})`,
        endsAt: sql<string>`upper(${schema.tableAllocation.period})`,
        reservation: schema.reservation,
        walkIn: schema.walkIn,
        guestName: schema.customer.name,
      })
      .from(schema.tableAllocation)
      .leftJoin(schema.reservation, eq(schema.tableAllocation.reservationId, schema.reservation.id))
      .leftJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
      .leftJoin(schema.walkIn, eq(schema.tableAllocation.walkInId, schema.walkIn.id))
      .where(
        and(
          isNull(schema.tableAllocation.releasedAt),
          sql`${schema.tableAllocation.period} && tstzrange(${now.toISOString()}::timestamptz, ${horizon.toISOString()}::timestamptz)`,
          sql`(${schema.tableAllocation.kind} <> 'HOLD' OR ${schema.tableAllocation.expiresAt} > ${now.toISOString()}::timestamptz)`,
        ),
      ),
  ]);

  return tables.map((table) => {
    const bookings: LiveBooking[] = rows
      .filter((row) => row.tableId === table.id)
      .map((row) => ({
        allocationId: row.allocationId,
        kind: row.kind,
        startsAt: new Date(row.startsAt),
        endsAt: new Date(row.endsAt),
        reservationId: row.reservation?.id ?? null,
        walkInId: row.walkIn?.id ?? null,
        reference: row.reservation?.reference ?? null,
        reservationStatus: row.reservation?.status ?? null,
        partySize: row.reservation?.partySize ?? row.walkIn?.partySize ?? null,
        guestName: row.guestName ?? row.walkIn?.name ?? null,
        depositCents: row.reservation?.depositCents ?? null,
        tableFeeCents: row.reservation?.tableFeeCents ?? null,
        notes: row.reservation?.staffNotes ?? row.reservation?.guestNotes ?? row.walkIn?.notes ?? (row.kind === "BLOCK" ? row.reason : null),
      }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    return {
      tableId: table.id,
      number: table.number,
      state: deriveTableState(
        table.status,
        bookings.map((booking) => ({ ...booking, reservationStatus: booking.reservationStatus ?? undefined })),
        now,
      ),
      bookings,
    };
  });
}
