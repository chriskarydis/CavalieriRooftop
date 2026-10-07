import { and, eq, isNull } from "drizzle-orm";
import { findCandidates } from "@/domain/allocation";
import { cancellationOutcome } from "@/domain/cancellation";
import { toRange } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { getAvailability, pickCandidate, priceCandidate, resolveSlot, type Availability, type Selection } from "./booking";
import {
  audit,
  BookingError,
  busyTables,
  GUEST,
  isOverlapViolation,
  loadFloorConfig,
  loadSettings,
  lockAllocations,
  type Actor,
  type Db,
  type ReservationRow,
  type Settings,
} from "./context";

/**
 * A guest moving their own confirmed reservation to another date or time.
 * The owner's rules:
 *  - allowed as often as the guest likes, up to the same cut-off as a free
 *    cancellation (24 hours before the reservation as it stands);
 *  - the party size stays the same (changing it means calling the restaurant);
 *  - the guest picks a table again for the new time;
 *  - no money moves. The amount already paid stays as it is: a cheaper table
 *    gives no refund, and a dearer one cannot be picked here.
 * After the move, the cancellation cut-off counts from the new time.
 *
 * Staff acting for a guest (on the phone, say) are not bound by the first,
 * second and last points: they may move a reservation at any time before it,
 * change the number of guests and pick any free table. Money still does not
 * move: nothing is charged or refunded, and the amounts stay as paid.
 */

/** Set when a member of staff makes the change for the guest. */
export interface StaffOverride {
  /** Staff may change the party size; guests may not. */
  partySize?: number;
}

const STAFF_MOVABLE = ["CONFIRMED", "LATE"];

/** Last instant at which the guest may still move the reservation, or null if it cannot be moved at all. */
export function moveDeadline(reservation: Pick<ReservationRow, "status" | "startsAt" | "totalCents">, settings: Settings): Date | null {
  if (reservation.status !== "CONFIRMED") return null;
  return cancellationOutcome({
    startsAt: reservation.startsAt,
    now: reservation.startsAt,
    refundCutoffHours: settings.refundCutoffHours,
    paidCents: reservation.totalCents,
  }).refundDeadline;
}

export function canMove(reservation: Pick<ReservationRow, "status" | "startsAt" | "totalCents">, settings: Settings, now: Date): boolean {
  const deadline = moveDeadline(reservation, settings);
  return deadline !== null && now.getTime() <= deadline.getTime();
}

async function activeTableIds(db: Db, reservationId: string): Promise<string[]> {
  const rows = await db
    .select({ tableId: schema.tableAllocation.tableId })
    .from(schema.tableAllocation)
    .where(and(eq(schema.tableAllocation.reservationId, reservationId), isNull(schema.tableAllocation.releasedAt)));
  return rows.map((row) => row.tableId);
}

export interface MoveOptions extends Availability {
  /** What the guest has paid; no table costing more than this is offered. */
  paidCents: number;
  /** The tables the reservation has now. */
  currentTableIds: string[];
}

/**
 * What the guest can move to at a given date and time: ordinary availability
 * for their party, without their own reservation in the way, and without
 * anything that costs more than they have paid.
 */
export async function getMoveOptions(
  db: Db,
  reservationId: string,
  slot: { date: string; time: string },
  now = new Date(),
  staff?: StaffOverride,
): Promise<MoveOptions> {
  const [reservation] = await db.select().from(schema.reservation).where(eq(schema.reservation.id, reservationId));
  if (!reservation) throw new BookingError("NOT_FOUND");
  const settings = await loadSettings(db);
  const allowed = staff ? STAFF_MOVABLE.includes(reservation.status) : canMove(reservation, settings, now);
  if (!allowed) throw new BookingError("TOO_LATE_TO_MOVE");

  const [availability, currentTableIds] = await Promise.all([
    getAvailability(db, { ...slot, partySize: staff?.partySize ?? reservation.partySize }, now, { excludeReservationId: reservationId }),
    activeTableIds(db, reservationId),
  ]);
  const paidCents = reservation.totalCents;
  if (staff) return { ...availability, paidCents, currentTableIds };
  return {
    ...availability,
    tables: availability.tables.map((table) =>
      table.price && table.price.totalCents > paidCents ? { ...table, state: "NOT_SUITABLE" as const, price: null } : table,
    ),
    groups: availability.groups.filter((group) => group.price.totalCents <= paidCents),
    auto: availability.auto && availability.auto.price.totalCents <= paidCents ? availability.auto : null,
    paidCents,
    currentTableIds,
  };
}

export interface MoveResult {
  startsAt: Date;
  tableIds: string[];
  /** What the new table would cost a new guest; never more than was paid. */
  newPriceCents: number;
  paidCents: number;
}

/** Moves the reservation. Everything is checked again here; the browser's view counts for nothing. */
export async function rescheduleReservation(
  db: Db,
  reservationId: string,
  request: { date: string; time: string; selection: Selection },
  actor: Actor = GUEST,
  now = new Date(),
  staff?: StaffOverride,
): Promise<MoveResult> {
  try {
    return await db.transaction(async (tx) => {
      await lockAllocations(tx);
      const [reservation] = await tx
        .select()
        .from(schema.reservation)
        .where(eq(schema.reservation.id, reservationId))
        .for("update");
      if (!reservation) throw new BookingError("NOT_FOUND");
      const settings = await loadSettings(tx);
      const allowed = staff ? STAFF_MOVABLE.includes(reservation.status) : canMove(reservation, settings, now);
      if (!allowed) throw new BookingError("TOO_LATE_TO_MOVE");

      const partySize = staff?.partySize ?? reservation.partySize;
      const slot = await resolveSlot(tx, { date: request.date, time: request.time, partySize }, settings, now);
      const config = await loadFloorConfig(tx);
      const busy = await busyTables(tx, slot.startsAt, slot.blockEnd, now, reservationId);
      const { selection } = request;
      const candidates = findCandidates({
        partySize,
        ...config,
        busyTableIds: new Set(busy.keys()),
        purpose: selection.mode === "AUTO" ? "ONLINE_AUTO" : "ONLINE_CHOICE",
      });
      const chosen = pickCandidate(candidates, selection, config, busy);

      const tableById = new Map(config.tables.map((table) => [table.id, table]));
      const mode = selection.mode === "AUTO" ? "AUTO" : "CHOSEN";
      const breakdown = priceCandidate(chosen, mode, partySize, config, settings, tableById);
      if (!staff && breakdown.totalCents > reservation.totalCents) throw new BookingError("COSTS_MORE");

      const previous = await tx
        .update(schema.tableAllocation)
        .set({ releasedAt: now })
        .where(and(eq(schema.tableAllocation.reservationId, reservationId), isNull(schema.tableAllocation.releasedAt)))
        .returning({ tableId: schema.tableAllocation.tableId });
      await tx.insert(schema.tableAllocation).values(
        chosen.tableIds.map((tableId) => ({
          tableId,
          period: toRange(slot.startsAt, slot.blockEnd),
          kind: "RESERVATION" as const,
          reservationId,
          reason: staff ? "Changed by staff" : "Moved by the guest",
        })),
      );
      // The money columns are left exactly as paid.
      await tx
        .update(schema.reservation)
        // A change by staff leaves the record of what the guest chose and paid for as it was.
        .set({
          startsAt: slot.startsAt,
          partySize,
          selectionMode: staff ? reservation.selectionMode : mode,
          tableSetByStaff: Boolean(staff),
          updatedAt: now,
        })
        .where(eq(schema.reservation.id, reservationId));

      const numberOf = (ids: string[]): number[] => ids.map((id) => tableById.get(id)?.number ?? 0).sort((a, b) => a - b);
      const before = {
        startsAt: reservation.startsAt.toISOString(),
        tables: numberOf(previous.map((row) => row.tableId)),
        partySize: reservation.partySize,
      };
      const after = {
        startsAt: slot.startsAt.toISOString(),
        tables: numberOf(chosen.tableIds),
        partySize,
        byStaff: Boolean(staff),
        newPriceCents: breakdown.totalCents,
        paidCents: reservation.totalCents,
      };
      await tx.insert(schema.reservationEvent).values({
        reservationId,
        fromStatus: reservation.status,
        toStatus: reservation.status,
        actor,
        reason: `${staff ? "Changed by staff" : "Moved by the guest"} from ${before.startsAt} (table ${before.tables.join("+")}, ${before.partySize} guests) to ${after.startsAt} (table ${after.tables.join("+")}, ${partySize} guests). Paid ${reservation.totalCents} cents, new table priced ${breakdown.totalCents} cents, nothing charged or refunded`,
      });
      await audit(tx, { actor, action: "reservation.rescheduled", entityType: "reservation", entityId: reservationId, before, after });

      return { startsAt: slot.startsAt, tableIds: chosen.tableIds, newPriceCents: breakdown.totalCents, paidCents: reservation.totalCents };
    });
  } catch (error) {
    if (isOverlapViolation(error)) throw new BookingError("TABLE_UNAVAILABLE");
    throw error;
  }
}
