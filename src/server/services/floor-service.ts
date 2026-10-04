import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { findCandidates, type Candidate } from "@/domain/allocation";
import { cancellationOutcome, type CancellationOutcome } from "@/domain/cancellation";
import { addMinutes, toRange } from "@/domain/time";
import * as schema from "@/server/db/schema";
import {
  audit,
  BookingError,
  busyTables,
  isOverlapViolation,
  loadFloorConfig,
  loadSettings,
  releaseAllocations,
  SYSTEM,
  transition,
  type Actor,
  type Db,
  type FloorConfig,
  type ReservationRow,
} from "./context";

/**
 * Operations during service: seating, no-shows, cancellations, walk-ins and
 * the automatic late/no-show jobs. Callers must have authorised the actor.
 */

/**
 * Seats the guests. Works from CONFIRMED and LATE at any time (no cut-off),
 * and from NO_SHOW as a staff override: the released table is taken again
 * from now, which fails with TABLE_UNAVAILABLE if it has been given away.
 */
export async function seatReservation(db: Db, reservationId: string, actor: Actor, now = new Date()): Promise<ReservationRow> {
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.reservation).where(eq(schema.reservation.id, reservationId));
      if (!before) throw new BookingError("NOT_FOUND");
      const seated = await transition(tx, reservationId, "SEATED", actor, now);

      if (before.status === "NO_SHOW") {
        const settings = await loadSettings(tx);
        const previous = await tx
          .selectDistinct({ tableId: schema.tableAllocation.tableId })
          .from(schema.tableAllocation)
          .where(eq(schema.tableAllocation.reservationId, reservationId));
        await tx.insert(schema.tableAllocation).values(
          previous.map(({ tableId }) => ({
            tableId,
            period: toRange(now, addMinutes(now, settings.blockMinutes)),
            kind: "RESERVATION" as const,
            reservationId,
            reason: "Seated after no-show",
          })),
        );
      }
      await audit(tx, {
        actor,
        action: before.status === "CONFIRMED" ? "reservation.seated" : "reservation.seated_override",
        entityType: "reservation",
        entityId: reservationId,
        before: { status: before.status },
        after: { status: "SEATED" },
      });
      return seated;
    });
  } catch (error) {
    if (isOverlapViolation(error)) throw new BookingError("TABLE_UNAVAILABLE");
    throw error;
  }
}

/** Marks a late reservation as a no-show and frees its table. The deposit is kept. */
export async function markNoShow(db: Db, reservationId: string, actor: Actor, now = new Date()): Promise<ReservationRow> {
  return db.transaction(async (tx) => {
    const updated = await transition(tx, reservationId, "NO_SHOW", actor, now);
    await releaseAllocations(tx, [reservationId], now);
    await audit(tx, {
      actor,
      action: "reservation.no_show",
      entityType: "reservation",
      entityId: reservationId,
      after: { status: "NO_SHOW" },
    });
    return updated;
  });
}

/** Guests have left; the table is free from now. */
export async function completeReservation(db: Db, reservationId: string, actor: Actor, now = new Date()): Promise<ReservationRow> {
  return db.transaction(async (tx) => {
    const updated = await transition(tx, reservationId, "COMPLETED", actor, now);
    await releaseAllocations(tx, [reservationId], now);
    return updated;
  });
}

/**
 * Cancels a reservation and frees its table. Returns what the policy refunds;
 * the payment layer issues the refund. A manager's discretionary refund of a
 * late cancellation is a separate action on the payment.
 */
export async function cancelReservation(
  db: Db,
  reservationId: string,
  actor: Actor,
  now = new Date(),
  reason?: string,
): Promise<{ reservation: ReservationRow; outcome: CancellationOutcome }> {
  return db.transaction(async (tx) => {
    const settings = await loadSettings(tx);
    const reservation = await transition(tx, reservationId, "CANCELLED", actor, now, reason);
    await releaseAllocations(tx, [reservationId], now);
    const outcome = cancellationOutcome({
      startsAt: reservation.startsAt,
      now,
      refundCutoffHours: settings.refundCutoffHours,
      paidCents: reservation.totalCents,
    });
    await audit(tx, {
      actor,
      action: "reservation.cancelled",
      entityType: "reservation",
      entityId: reservationId,
      after: { status: "CANCELLED", refundCents: outcome.refundCents, reason },
    });
    return { reservation, outcome };
  });
}

/** Scheduled job: confirmed reservations whose grace period has passed become LATE. */
export async function flagLateReservations(db: Db, now = new Date()): Promise<string[]> {
  return db.transaction(async (tx) => {
    const settings = await loadSettings(tx);
    const due = await tx
      .select({ id: schema.reservation.id })
      .from(schema.reservation)
      .where(
        and(
          eq(schema.reservation.status, "CONFIRMED"),
          lt(schema.reservation.startsAt, addMinutes(now, -settings.graceMinutes)),
        ),
      );
    for (const { id } of due) await transition(tx, id, "LATE", SYSTEM, now, "Grace period passed");
    return due.map((row) => row.id);
  });
}

/**
 * Scheduled job: a reservation still LATE when its table block ends becomes a
 * NO_SHOW. Staff can still seat the guests afterwards.
 */
export async function closeOutLateReservations(db: Db, now = new Date()): Promise<string[]> {
  return db.transaction(async (tx) => {
    const settings = await loadSettings(tx);
    const due = await tx
      .select({ id: schema.reservation.id })
      .from(schema.reservation)
      .where(
        and(
          eq(schema.reservation.status, "LATE"),
          lt(schema.reservation.startsAt, addMinutes(now, -settings.blockMinutes)),
        ),
      );
    const ids = due.map((row) => row.id);
    for (const id of ids) await transition(tx, id, "NO_SHOW", SYSTEM, now, "Did not arrive");
    if (ids.length > 0) await releaseAllocations(tx, ids, now);
    return ids;
  });
}

// ── Walk-ins ────────────────────────────────────────────────────────────────

export interface WalkInInput {
  partySize: number;
  kind: "FOOD" | "DRINKS";
  tableIds: string[];
  expectedMinutes: number;
  name?: string;
  notes?: string;
  /**
   * Seat the party even though the table has a later reservation. The walk-in
   * is then recorded as ending when that reservation's block starts.
   */
  overrideUpcoming?: boolean;
}

/** Staff may only seat a party at one table, a configured combination or a configured pairing. */
function assertConfiguredSeating(config: FloorConfig, tableIds: string[], partySize: number): void {
  const matches = (ids: string[]): boolean => ids.length === tableIds.length && ids.every((id) => tableIds.includes(id));
  const [single] = tableIds.length === 1 ? config.tables.filter((table) => table.id === tableIds[0]) : [];
  if (single && partySize <= single.maxCapacity) return;

  const active = config.combinations.filter((combination) => combination.active);
  if (active.some((combination) => matches(combination.tableIds) && partySize <= combination.capacity)) return;

  for (const pairing of config.pairings.filter((entry) => entry.active)) {
    const [first, second] = pairing.combinationIds.map((id) => active.find((combination) => combination.id === id));
    if (!first || !second) continue;
    if (matches([...first.tableIds, ...second.tableIds]) && partySize <= first.capacity + second.capacity) return;
  }
  throw new BookingError("INVALID_SELECTION");
}

/** Tables staff could give a walk-in right now for the expected duration, best first. */
export async function suggestWalkInTables(
  db: Db,
  input: { partySize: number; expectedMinutes: number },
  now = new Date(),
): Promise<Candidate[]> {
  const [config, busy] = await Promise.all([
    loadFloorConfig(db),
    busyTables(db, now, addMinutes(now, input.expectedMinutes), now),
  ]);
  return findCandidates({ partySize: input.partySize, purpose: "STAFF", ...config, busyTableIds: new Set(busy.keys()) });
}

export async function createWalkIn(
  db: Db,
  input: WalkInInput,
  actor: Actor,
  now = new Date(),
): Promise<{ walkInId: string; until: Date; shortened: boolean }> {
  if (input.tableIds.length === 0 || !Number.isInteger(input.partySize) || input.partySize < 1) {
    throw new BookingError("INVALID_SELECTION");
  }
  try {
    return await db.transaction(async (tx) => {
      const tables = await tx.select().from(schema.diningTable).where(inArray(schema.diningTable.id, input.tableIds));
      if (tables.length !== input.tableIds.length || tables.some((table) => table.status !== "ACTIVE")) {
        throw new BookingError("INVALID_SELECTION");
      }
      assertConfiguredSeating(await loadFloorConfig(tx), input.tableIds, input.partySize);

      let until = addMinutes(now, input.expectedMinutes);
      const [conflict] = await tx
        .select({ startsAt: sql<Date | string | null>`min(lower(${schema.tableAllocation.period}))` })
        .from(schema.tableAllocation)
        .where(
          and(
            inArray(schema.tableAllocation.tableId, input.tableIds),
            isNull(schema.tableAllocation.releasedAt),
            sql`${schema.tableAllocation.period} && ${toRange(now, until)}::tstzrange`,
            sql`(${schema.tableAllocation.kind} <> 'HOLD' OR ${schema.tableAllocation.expiresAt} > ${now.toISOString()}::timestamptz)`,
          ),
        );
      const conflictStart = conflict?.startsAt ? new Date(conflict.startsAt) : null;

      let shortened = false;
      if (conflictStart) {
        if (conflictStart.getTime() <= now.getTime()) throw new BookingError("TABLE_UNAVAILABLE");
        if (!input.overrideUpcoming) throw new BookingError("UPCOMING_RESERVATION", { startsAt: conflictStart });
        until = conflictStart;
        shortened = true;
      }

      const [walkIn] = await tx
        .insert(schema.walkIn)
        .values({
          name: input.name?.trim() || null,
          partySize: input.partySize,
          kind: input.kind,
          arrivedAt: now,
          expectedMinutes: input.expectedMinutes,
          notes: input.notes?.trim() || null,
        })
        .returning({ id: schema.walkIn.id });
      await tx.insert(schema.tableAllocation).values(
        input.tableIds.map((tableId) => ({
          tableId,
          period: toRange(now, until),
          kind: "WALK_IN" as const,
          walkInId: walkIn.id,
          reason: shortened ? "Seated before an upcoming reservation (override)" : null,
        })),
      );
      await audit(tx, {
        actor,
        action: shortened ? "walk_in.created_override" : "walk_in.created",
        entityType: "walk_in",
        entityId: walkIn.id,
        after: { partySize: input.partySize, kind: input.kind, tableIds: input.tableIds, until },
      });
      return { walkInId: walkIn.id, until, shortened };
    });
  } catch (error) {
    if (isOverlapViolation(error)) throw new BookingError("TABLE_UNAVAILABLE");
    throw error;
  }
}

/** The walk-in party has left; the table is free from now. */
export async function completeWalkIn(db: Db, walkInId: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.walkIn)
      .set({ status: "COMPLETED" })
      .where(and(eq(schema.walkIn.id, walkInId), eq(schema.walkIn.status, "SEATED")))
      .returning({ id: schema.walkIn.id });
    if (updated.length === 0) throw new BookingError("NOT_FOUND");
    await tx
      .update(schema.tableAllocation)
      .set({ releasedAt: now })
      .where(and(eq(schema.tableAllocation.walkInId, walkInId), isNull(schema.tableAllocation.releasedAt)));
  });
}
