import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { deriveTableState, type LiveTableState } from "@/domain/table-state";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import type { Db } from "./context";

const LOOKAHEAD_MINUTES = 12 * 60;

export interface LiveBooking {
  kind: "HOLD" | "RESERVATION" | "WALK_IN" | "BLOCK";
  startsAt: Date;
  endsAt: Date;
  reservationId: string | null;
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

/** The state of every table right now, with tonight's bookings on it. */
export async function getLiveFloor(db: Db, now = new Date()): Promise<LiveTable[]> {
  const horizon = addMinutes(now, LOOKAHEAD_MINUTES);
  const [tables, rows] = await Promise.all([
    db.select().from(schema.diningTable).orderBy(asc(schema.diningTable.number)),
    db
      .select({
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
        kind: row.kind,
        startsAt: new Date(row.startsAt),
        endsAt: new Date(row.endsAt),
        reservationId: row.reservation?.id ?? null,
        reference: row.reservation?.reference ?? null,
        reservationStatus: row.reservation?.status ?? null,
        partySize: row.reservation?.partySize ?? row.walkIn?.partySize ?? null,
        guestName: row.guestName ?? row.walkIn?.name ?? null,
        depositCents: row.reservation?.depositCents ?? null,
        tableFeeCents: row.reservation?.tableFeeCents ?? null,
        notes: row.reservation?.staffNotes ?? row.reservation?.guestNotes ?? row.walkIn?.notes ?? null,
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
