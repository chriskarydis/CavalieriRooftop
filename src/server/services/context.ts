import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { assertTransition, type ReservationStatus } from "@/domain/reservation-state";
import { toRange } from "@/domain/time";
import type { DomainCombination, DomainPairing, DomainTable } from "@/domain/types";
import * as schema from "@/server/db/schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Settings = typeof schema.restaurantSettings.$inferSelect;
export type ReservationRow = typeof schema.reservation.$inferSelect;

/** Who performed an action: a staff user id, "guest" or "system". */
export type Actor = string;
export const SYSTEM: Actor = "system";
export const GUEST: Actor = "guest";

export type BookingErrorCode =
  | "CLOSED"
  | "INVALID_SLOT"
  | "IN_THE_PAST"
  | "PARTY_SIZE"
  | "TABLE_UNAVAILABLE"
  | "NO_AVAILABILITY"
  | "INVALID_SELECTION"
  | "UPCOMING_RESERVATION"
  | "NOT_FOUND"
  | "HOLD_EXPIRED"
  | "DETAILS_REQUIRED";

/** A business-rule failure that is safe to show to the person who caused it. */
export class BookingError extends Error {
  constructor(
    public readonly code: BookingErrorCode,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "BookingError";
  }
}

/** True when Postgres rejected an insert because the table is already allocated for that time. */
export function isOverlapViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: string }).code === "23P01") return true;
  }
  return false;
}

export async function loadSettings(tx: Tx | Db): Promise<Settings> {
  const [settings] = await tx.select().from(schema.restaurantSettings).limit(1);
  if (!settings) throw new Error("restaurant_settings has not been initialised");
  return settings;
}

export interface FloorConfig {
  tables: DomainTable[];
  combinations: DomainCombination[];
  pairings: DomainPairing[];
}

export async function loadFloorConfig(tx: Tx | Db): Promise<FloorConfig> {
  const [tableRows, combinationRows, memberRows, pairingRows] = await Promise.all([
    tx
      .select({ table: schema.diningTable, category: schema.tableCategory })
      .from(schema.diningTable)
      .innerJoin(schema.tableCategory, eq(schema.diningTable.categoryId, schema.tableCategory.id)),
    tx.select().from(schema.tableCombination),
    tx.select().from(schema.tableCombinationMember),
    tx.select().from(schema.combinationPairing),
  ]);

  return {
    tables: tableRows.map(({ table, category }) => ({
      id: table.id,
      number: table.number,
      capacity: table.capacity,
      maxCapacity: table.maxCapacity,
      status: table.status,
      onlineBookable: table.onlineBookable,
      autoAssignable: table.autoAssignable,
      priority: table.priority,
      feeCents: category.active ? category.extraFeeCents : 0,
      categoryName: category.name.en ?? "",
      feeCountsTowardMinSpend: category.feeCountsTowardMinSpend,
    })),
    combinations: combinationRows.map((combination) => ({
      id: combination.id,
      name: combination.name,
      tableIds: memberRows.filter((member) => member.combinationId === combination.id).map((member) => member.tableId),
      capacity: combination.capacity,
      minParty: combination.minParty,
      active: combination.active,
      onlineBookable: combination.onlineBookable,
      priority: combination.priority,
    })),
    pairings: pairingRows.map((pairing) => ({
      id: pairing.id,
      combinationIds: [pairing.firstCombinationId, pairing.secondCombinationId],
      active: pairing.active,
    })),
  };
}

export type BusyKind = "HELD" | "TAKEN";

/**
 * Tables with a live allocation overlapping [start, end). Holds past their
 * expiry are ignored even if they have not been cleaned up yet.
 */
export async function busyTables(tx: Tx | Db, start: Date, end: Date, now: Date): Promise<Map<string, BusyKind>> {
  const rows = await tx
    .select({ tableId: schema.tableAllocation.tableId, kind: schema.tableAllocation.kind })
    .from(schema.tableAllocation)
    .where(
      and(
        isNull(schema.tableAllocation.releasedAt),
        sql`${schema.tableAllocation.period} && ${toRange(start, end)}::tstzrange`,
        sql`(${schema.tableAllocation.kind} <> 'HOLD' OR ${schema.tableAllocation.expiresAt} > ${now.toISOString()}::timestamptz)`,
      ),
    );
  const busy = new Map<string, BusyKind>();
  for (const row of rows) {
    if (row.kind !== "HOLD" || !busy.has(row.tableId)) busy.set(row.tableId, row.kind === "HOLD" ? "HELD" : "TAKEN");
  }
  return busy;
}

/**
 * Expires unpaid reservations whose hold has lapsed and frees their tables.
 * Runs before every booking attempt and from the scheduled job.
 */
export async function releaseExpiredHolds(tx: Tx, now: Date): Promise<string[]> {
  const expired = await tx
    .update(schema.reservation)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(and(eq(schema.reservation.status, "PENDING_PAYMENT"), lte(schema.reservation.holdExpiresAt, now)))
    .returning({ id: schema.reservation.id });
  const ids = expired.map((row) => row.id);
  if (ids.length === 0) return ids;

  await releaseAllocations(tx, ids, now);
  await tx.insert(schema.reservationEvent).values(
    ids.map((reservationId) => ({
      reservationId,
      fromStatus: "PENDING_PAYMENT" as const,
      toStatus: "EXPIRED" as const,
      actor: SYSTEM,
      reason: "Hold expired before payment",
    })),
  );
  return ids;
}

export async function releaseAllocations(tx: Tx, reservationIds: string[], now: Date): Promise<void> {
  await tx
    .update(schema.tableAllocation)
    .set({ releasedAt: now })
    .where(and(inArray(schema.tableAllocation.reservationId, reservationIds), isNull(schema.tableAllocation.releasedAt)));
}

/** Locks the reservation, validates the transition, writes the new status and its history row. */
export async function transition(
  tx: Tx,
  reservationId: string,
  to: ReservationStatus,
  actor: Actor,
  now: Date,
  reason?: string,
): Promise<ReservationRow> {
  const [current] = await tx
    .select()
    .from(schema.reservation)
    .where(eq(schema.reservation.id, reservationId))
    .for("update");
  if (!current) throw new BookingError("NOT_FOUND");
  assertTransition(current.status, to);

  const [updated] = await tx
    .update(schema.reservation)
    .set({ status: to, updatedAt: now })
    .where(eq(schema.reservation.id, reservationId))
    .returning();
  await tx
    .insert(schema.reservationEvent)
    .values({ reservationId, fromStatus: current.status, toStatus: to, actor, reason });
  return updated;
}

export async function audit(
  tx: Tx,
  entry: { actor: Actor; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown },
): Promise<void> {
  await tx.insert(schema.auditLog).values(entry);
}
