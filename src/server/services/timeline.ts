import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { addMinutes, toRange, zonedToInstant } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { loadSettings, type Db } from "./context";

/** The evening shown on the timeline, in the restaurant's local time. */
const WINDOW_START = "18:00";
const WINDOW_MINUTES = 9 * 60;

export interface TimelineEntry {
  allocationId: string;
  kind: "HOLD" | "RESERVATION" | "WALK_IN" | "BLOCK";
  startsAt: Date;
  endsAt: Date;
  status: schema.ReservationStatusValue | null;
  label: string | null;
  partySize: number | null;
  reference: string | null;
  tableNumber: number;
  phone: string | null;
  email: string | null;
  /** For a hold: when the guest's 10 minutes run out. */
  holdExpiresAt: Date | null;
}

export interface Timeline {
  windowStart: Date;
  windowEnd: Date;
  tables: Array<{ tableId: string; number: number; capacity: number; active: boolean; entries: TimelineEntry[] }>;
}

/**
 * Every table's evening on one service date: reservations, walk-ins, blocks
 * and live holds. Finished stays (released early) are shown up to when the
 * table was freed.
 */
export async function getTimeline(db: Db, date: string, now = new Date()): Promise<Timeline> {
  const settings = await loadSettings(db);
  const windowStart = zonedToInstant(date, WINDOW_START, settings.timezone);
  const windowEnd = addMinutes(windowStart, WINDOW_MINUTES);

  const [tables, rows] = await Promise.all([
    db.select().from(schema.diningTable).orderBy(asc(schema.diningTable.number)),
    db
      .select({
        allocationId: schema.tableAllocation.id,
        tableId: schema.tableAllocation.tableId,
        kind: schema.tableAllocation.kind,
        startsAt: sql<string>`lower(${schema.tableAllocation.period})`,
        endsAt: sql<string>`upper(${schema.tableAllocation.period})`,
        releasedAt: schema.tableAllocation.releasedAt,
        reason: schema.tableAllocation.reason,
        reservation: schema.reservation,
        walkIn: schema.walkIn,
        guestName: schema.customer.name,
        guestPhone: schema.customer.phone,
        guestEmail: schema.customer.email,
        expiresAt: schema.tableAllocation.expiresAt,
      })
      .from(schema.tableAllocation)
      .leftJoin(schema.reservation, eq(schema.tableAllocation.reservationId, schema.reservation.id))
      .leftJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
      .leftJoin(schema.walkIn, eq(schema.tableAllocation.walkInId, schema.walkIn.id))
      .where(
        and(
          sql`${schema.tableAllocation.period} && ${toRange(windowStart, windowEnd)}::tstzrange`,
          // Live allocations, plus stays that did happen and ended early.
          or(
            isNull(schema.tableAllocation.releasedAt),
            eq(schema.reservation.status, "COMPLETED"),
            eq(schema.walkIn.status, "COMPLETED"),
          ),
          sql`(${schema.tableAllocation.kind} <> 'HOLD' OR ${schema.tableAllocation.expiresAt} > ${now.toISOString()}::timestamptz)`,
        ),
      ),
  ]);

  return {
    windowStart,
    windowEnd,
    tables: tables
      .filter((table) => table.status === "ACTIVE" || rows.some((row) => row.tableId === table.id))
      .map((table) => ({
        tableId: table.id,
        number: table.number,
        capacity: table.capacity,
        active: table.status === "ACTIVE",
        entries: rows
          .filter((row) => row.tableId === table.id)
          .map((row) => {
            const plannedEnd = new Date(row.endsAt);
            const endsAt = row.releasedAt && row.releasedAt.getTime() < plannedEnd.getTime() ? row.releasedAt : plannedEnd;
            return {
              allocationId: row.allocationId,
              kind: row.kind,
              startsAt: new Date(row.startsAt),
              endsAt,
              status: row.reservation?.status ?? null,
              label: row.guestName ?? row.walkIn?.name ?? (row.kind === "BLOCK" ? row.reason : null),
              partySize: row.reservation?.partySize ?? row.walkIn?.partySize ?? null,
              reference: row.reservation?.reference ?? null,
              tableNumber: table.number,
              phone: row.guestPhone ?? null,
              email: row.guestEmail ?? null,
              holdExpiresAt: row.kind === "HOLD" ? row.expiresAt : null,
            };
          })
          .filter((entry) => entry.endsAt.getTime() > entry.startsAt.getTime())
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
      })),
  };
}
