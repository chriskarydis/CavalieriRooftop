import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { price, smallestSuitableCapacity } from "@/domain/pricing";
import { toRange } from "@/domain/time";
import * as schema from "@/server/db/schema";
import {
  audit,
  BookingError,
  isOverlapViolation,
  loadFloorConfig,
  loadSettings,
  lockAllocations,
  type Actor,
  type Db,
  type Tx,
} from "./context";
import { assertConfiguredSeating } from "./floor-service";

/**
 * Staff operations on tables: manual blocks and moving a reservation to
 * another table. Callers must have authorised the actor.
 */

/** Keeps tables out of use for a period (maintenance, weather, private use). */
export async function blockTables(
  db: Db,
  input: { tableIds: string[]; from: Date; until: Date; reason?: string },
  actor: Actor,
): Promise<void> {
  if (input.tableIds.length === 0 || input.until.getTime() <= input.from.getTime()) {
    throw new BookingError("INVALID_SELECTION");
  }
  try {
    await db.transaction(async (tx) => {
      await lockAllocations(tx);
      const rows = await tx
        .insert(schema.tableAllocation)
        .values(
          input.tableIds.map((tableId) => ({
            tableId,
            period: toRange(input.from, input.until),
            kind: "BLOCK" as const,
            reason: input.reason?.trim() || null,
          })),
        )
        .returning({ id: schema.tableAllocation.id });
      await audit(tx, {
        actor,
        action: "table.blocked",
        entityType: "table_allocation",
        entityId: rows[0].id,
        after: { tableIds: input.tableIds, from: input.from, until: input.until, reason: input.reason },
      });
    });
  } catch (error) {
    if (isOverlapViolation(error)) throw new BookingError("TABLE_UNAVAILABLE");
    throw error;
  }
}

export interface BlockListItem {
  allocationId: string;
  tableNumber: number;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
}

/** Live manual blocks that overlap [from, until), earliest first. */
export async function listBlocks(db: Db, from: Date, until: Date): Promise<BlockListItem[]> {
  const rows = await db
    .select({
      allocationId: schema.tableAllocation.id,
      tableNumber: schema.diningTable.number,
      startsAt: sql<string>`lower(${schema.tableAllocation.period})`,
      endsAt: sql<string>`upper(${schema.tableAllocation.period})`,
      reason: schema.tableAllocation.reason,
    })
    .from(schema.tableAllocation)
    .innerJoin(schema.diningTable, eq(schema.tableAllocation.tableId, schema.diningTable.id))
    .where(
      and(
        eq(schema.tableAllocation.kind, "BLOCK"),
        isNull(schema.tableAllocation.releasedAt),
        sql`${schema.tableAllocation.period} && ${toRange(from, until)}::tstzrange`,
      ),
    );
  return rows
    .map((row) => ({ ...row, startsAt: new Date(row.startsAt), endsAt: new Date(row.endsAt) }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.tableNumber - b.tableNumber);
}

/** Ends a manual block now. */
export async function releaseBlock(db: Db, allocationId: string, actor: Actor, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const released = await tx
      .update(schema.tableAllocation)
      .set({ releasedAt: now })
      .where(
        and(
          eq(schema.tableAllocation.id, allocationId),
          eq(schema.tableAllocation.kind, "BLOCK"),
          isNull(schema.tableAllocation.releasedAt),
        ),
      )
      .returning({ id: schema.tableAllocation.id });
    if (released.length === 0) throw new BookingError("NOT_FOUND");
    await audit(tx, { actor, action: "table.unblocked", entityType: "table_allocation", entityId: allocationId });
  });
}

export interface MovePreview {
  fromTableNumbers: number[];
  toTableNumbers: number[];
  /** What the guest paid online for the original seating. */
  paid: { depositCents: number; tableFeeCents: number; totalCents: number };
  /** What the new seating would have cost had the guest chosen it. */
  target: { depositCents: number; tableFeeCents: number; totalCents: number };
  /** target total minus paid total. Recorded only: nothing is charged or refunded. */
  differenceCents: number;
}

async function prepareMove(tx: Tx | Db, reservationId: string, tableIds: string[]) {
  const [reservation] = await tx.select().from(schema.reservation).where(eq(schema.reservation.id, reservationId));
  if (!reservation) throw new BookingError("NOT_FOUND");
  if (!["CONFIRMED", "LATE", "SEATED"].includes(reservation.status)) throw new BookingError("INVALID_SELECTION");

  const [config, settings, current] = await Promise.all([
    loadFloorConfig(tx),
    loadSettings(tx),
    tx
      .select({
        id: schema.tableAllocation.id,
        tableId: schema.tableAllocation.tableId,
        period: schema.tableAllocation.period,
      })
      .from(schema.tableAllocation)
      .where(and(eq(schema.tableAllocation.reservationId, reservationId), isNull(schema.tableAllocation.releasedAt))),
  ]);
  if (current.length === 0) throw new BookingError("INVALID_SELECTION");

  const seating = assertConfiguredSeating(config, tableIds, reservation.partySize);
  const target = price({
    partySize: reservation.partySize,
    selectionMode: "CHOSEN",
    seating,
    smallestSuitableCapacity: smallestSuitableCapacity(reservation.partySize, config.tables),
    settings,
  });
  const numberOf = new Map(config.tables.map((table) => [table.id, table.number]));
  const numbers = (ids: string[]): number[] => ids.map((id) => numberOf.get(id) ?? 0).sort((a, b) => a - b);

  const preview: MovePreview = {
    fromTableNumbers: numbers(current.map((row) => row.tableId)),
    toTableNumbers: numbers(tableIds),
    paid: {
      depositCents: reservation.depositCents,
      tableFeeCents: reservation.tableFeeCents,
      totalCents: reservation.totalCents,
    },
    target: { depositCents: target.depositCents, tableFeeCents: target.tableFeeCents, totalCents: target.totalCents },
    differenceCents: target.totalCents - reservation.totalCents,
  };
  return { reservation, current, preview };
}

/** What moving the reservation would change, for staff to confirm. Does not check availability. */
export async function previewMove(db: Db, reservationId: string, tableIds: string[]): Promise<MovePreview> {
  return (await prepareMove(db, reservationId, tableIds)).preview;
}

/**
 * Moves a reservation to another table, combination or pairing for the rest
 * of its time. Per the owner's rule, no money is refunded or collected: the
 * price snapshot stays as paid and the difference is recorded in the history
 * and the audit log.
 */
export async function moveReservation(
  db: Db,
  reservationId: string,
  tableIds: string[],
  actor: Actor,
  now = new Date(),
): Promise<MovePreview> {
  try {
    return await db.transaction(async (tx) => {
      await lockAllocations(tx);
      await tx.select().from(schema.reservation).where(eq(schema.reservation.id, reservationId)).for("update");
      const { current, preview } = await prepareMove(tx, reservationId, tableIds);

      await tx
        .update(schema.tableAllocation)
        .set({ releasedAt: now })
        .where(
          inArray(
            schema.tableAllocation.id,
            current.map((row) => row.id),
          ),
        );
      await tx.insert(schema.tableAllocation).values(
        tableIds.map((tableId) => ({
          tableId,
          // Keep the original time window; only the tables change.
          period: current[0].period,
          kind: "RESERVATION" as const,
          reservationId,
          reason: `Moved from ${preview.fromTableNumbers.join("+")}`,
        })),
      );

      const [{ status }] = await tx
        .select({ status: schema.reservation.status })
        .from(schema.reservation)
        .where(eq(schema.reservation.id, reservationId));
      await tx.insert(schema.reservationEvent).values({
        reservationId,
        fromStatus: status,
        toStatus: status,
        actor,
        reason: `Moved from table ${preview.fromTableNumbers.join("+")} to ${preview.toTableNumbers.join("+")}; price difference ${preview.differenceCents} cents not charged or refunded`,
      });
      await tx
        .update(schema.reservation)
        .set({ updatedAt: sql`now()` })
        .where(eq(schema.reservation.id, reservationId));
      await audit(tx, {
        actor,
        action: "reservation.moved",
        entityType: "reservation",
        entityId: reservationId,
        before: { tables: preview.fromTableNumbers, ...preview.paid },
        after: { tables: preview.toTableNumbers, ...preview.target, differenceCents: preview.differenceCents },
      });
      return preview;
    });
  } catch (error) {
    if (isOverlapViolation(error)) throw new BookingError("TABLE_UNAVAILABLE");
    throw error;
  }
}
