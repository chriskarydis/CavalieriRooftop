import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { findCandidates, type Candidate } from "@/domain/allocation";
import { price, smallestSuitableCapacity, type PriceBreakdown } from "@/domain/pricing";
import { addMinutes, closedReason, toRange, zonedToInstant } from "@/domain/time";
import type { DomainTable } from "@/domain/types";
import * as schema from "@/server/db/schema";
import {
  BookingError,
  busyTables,
  GUEST,
  isOverlapViolation,
  loadFloorConfig,
  loadSettings,
  releaseExpiredHolds,
  SYSTEM,
  type Actor,
  type Db,
  type FloorConfig,
  type Settings,
  type Tx,
} from "./context";

/**
 * Guest booking: availability, holding a table, attaching guest details and
 * confirming after payment. Everything here is server-authoritative; the
 * browser only sends a date, a time, a party size and a selection.
 */

export interface SlotRequest {
  /** YYYY-MM-DD in the restaurant's timezone. */
  date: string;
  /** HH:mm, one of the configured time slots. */
  time: string;
  partySize: number;
}

export type Selection =
  | { mode: "AUTO" }
  | { mode: "TABLE"; tableId: string }
  | { mode: "GROUP"; combinationIds: string[] };

export type TableAvailability = "AVAILABLE" | "HELD" | "TAKEN" | "NOT_SUITABLE";

export interface Availability {
  startsAt: Date;
  /** Every table guests may see, with its state for this slot and party. */
  tables: Array<{ tableId: string; number: number; state: TableAvailability; price: PriceBreakdown | null }>;
  /** Joined-table arrangements that fit the party. */
  groups: Array<{ combinationIds: string[]; tableIds: string[]; capacity: number; price: PriceBreakdown }>;
  /** "Let us choose": null when nothing can be assigned automatically. */
  auto: { price: PriceBreakdown } | null;
}

interface Slot {
  startsAt: Date;
  blockEnd: Date;
}

async function resolveSlot(tx: Tx | Db, request: SlotRequest, settings: Settings, now: Date): Promise<Slot> {
  const { date, time, partySize } = request;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !settings.timeSlots.includes(time)) throw new BookingError("INVALID_SLOT");
  if (!Number.isInteger(partySize) || partySize < settings.minOnlineParty || partySize > settings.maxOnlineParty) {
    throw new BookingError("PARTY_SIZE", { min: settings.minOnlineParty, max: settings.maxOnlineParty });
  }
  const closures = await tx.select({ date: schema.closure.date }).from(schema.closure).where(eq(schema.closure.date, date));
  const reason = closedReason(date, settings, new Set(closures.map((row) => row.date)));
  if (reason) throw new BookingError("CLOSED", { reason });

  const startsAt = zonedToInstant(date, time, settings.timezone);
  if (startsAt.getTime() <= now.getTime()) throw new BookingError("IN_THE_PAST");
  return { startsAt, blockEnd: addMinutes(startsAt, settings.blockMinutes) };
}

function priceCandidate(
  candidate: Candidate,
  mode: "AUTO" | "CHOSEN",
  partySize: number,
  config: FloorConfig,
  settings: Settings,
  tableById: Map<string, DomainTable>,
): PriceBreakdown {
  const table = candidate.kind === "TABLE" ? tableById.get(candidate.tableIds[0]) : undefined;
  return price({
    partySize,
    selectionMode: mode,
    seating: table ? { kind: "TABLE", table } : { kind: "COMBINATION", capacity: candidate.capacity },
    smallestSuitableCapacity: smallestSuitableCapacity(partySize, config.tables),
    settings,
  });
}

const sameIds = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

export async function getAvailability(db: Db, request: SlotRequest, now = new Date()): Promise<Availability> {
  const settings = await loadSettings(db);
  const slot = await resolveSlot(db, request, settings, now);
  const [config, busy] = await Promise.all([loadFloorConfig(db), busyTables(db, slot.startsAt, slot.blockEnd, now)]);
  const tableById = new Map(config.tables.map((table) => [table.id, table]));
  const base = { partySize: request.partySize, ...config, busyTableIds: new Set(busy.keys()) };

  const choices = findCandidates({ ...base, purpose: "ONLINE_CHOICE" });
  const choosable = new Map(
    choices.filter((candidate) => candidate.kind === "TABLE").map((candidate) => [candidate.tableIds[0], candidate]),
  );
  const [best] = findCandidates({ ...base, purpose: "ONLINE_AUTO" });

  return {
    startsAt: slot.startsAt,
    tables: config.tables
      .filter((table) => table.status === "ACTIVE" && table.onlineBookable)
      .sort((a, b) => a.number - b.number)
      .map((table) => {
        const candidate = choosable.get(table.id);
        const busyKind = busy.get(table.id);
        return {
          tableId: table.id,
          number: table.number,
          state: candidate ? "AVAILABLE" : (busyKind ?? "NOT_SUITABLE"),
          price: candidate
            ? priceCandidate(candidate, "CHOSEN", request.partySize, config, settings, tableById)
            : null,
        };
      }),
    groups: choices
      .filter((candidate) => candidate.kind !== "TABLE")
      .map((candidate) => ({
        combinationIds: candidate.combinationIds,
        tableIds: candidate.tableIds,
        capacity: candidate.capacity,
        price: priceCandidate(candidate, "CHOSEN", request.partySize, config, settings, tableById),
      })),
    auto: best ? { price: priceCandidate(best, "AUTO", request.partySize, config, settings, tableById) } : null,
  };
}

export interface HoldResult {
  reservationId: string;
  reference: string;
  /** Secret for the guest's manage link. Returned once; only its hash is stored. */
  manageToken: string;
  expiresAt: Date;
  tableIds: string[];
  price: PriceBreakdown;
}

export function hashManageToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Two "let us choose" guests can race for the same best table; the loser simply gets the next one. */
const AUTO_ASSIGN_ATTEMPTS = 3;

/**
 * Holds a table for `holdMinutes` while the guest enters details and pays.
 * Throws TABLE_UNAVAILABLE when someone else holds or has booked the selection.
 */
export async function createHold(
  db: Db,
  request: SlotRequest & { selection: Selection; locale: string },
  now = new Date(),
): Promise<HoldResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction((tx) => holdInTransaction(tx, request, now));
    } catch (error) {
      if (!isOverlapViolation(error)) throw error;
      if (request.selection.mode !== "AUTO" || attempt >= AUTO_ASSIGN_ATTEMPTS) {
        throw new BookingError("TABLE_UNAVAILABLE");
      }
    }
  }
}

async function holdInTransaction(
  tx: Tx,
  request: SlotRequest & { selection: Selection; locale: string },
  now: Date,
): Promise<HoldResult> {
  await releaseExpiredHolds(tx, now);
  const settings = await loadSettings(tx);
  const slot = await resolveSlot(tx, request, settings, now);
  const config = await loadFloorConfig(tx);
  const busy = await busyTables(tx, slot.startsAt, slot.blockEnd, now);
  const { selection, partySize } = request;

  const candidates = findCandidates({
    partySize,
    ...config,
    busyTableIds: new Set(busy.keys()),
    purpose: selection.mode === "AUTO" ? "ONLINE_AUTO" : "ONLINE_CHOICE",
  });

  let chosen: Candidate | undefined;
  if (selection.mode === "AUTO") {
    chosen = candidates[0];
    if (!chosen) throw new BookingError("NO_AVAILABILITY");
  } else if (selection.mode === "TABLE") {
    chosen = candidates.find((candidate) => candidate.kind === "TABLE" && candidate.tableIds[0] === selection.tableId);
    if (!chosen) {
      throw new BookingError(busy.has(selection.tableId) ? "TABLE_UNAVAILABLE" : "INVALID_SELECTION");
    }
  } else {
    chosen = candidates.find(
      (candidate) => candidate.kind !== "TABLE" && sameIds(candidate.combinationIds, selection.combinationIds),
    );
    if (!chosen) {
      const members = config.combinations
        .filter((combination) => selection.combinationIds.includes(combination.id))
        .flatMap((combination) => combination.tableIds);
      throw new BookingError(members.some((id) => busy.has(id)) ? "TABLE_UNAVAILABLE" : "INVALID_SELECTION");
    }
  }

  const tableById = new Map(config.tables.map((table) => [table.id, table]));
  const mode = selection.mode === "AUTO" ? "AUTO" : "CHOSEN";
  const breakdown = priceCandidate(chosen, mode, partySize, config, settings, tableById);

  const [{ next }] = await tx.execute<{ next: string }>(sql`SELECT nextval('reservation_reference_seq') AS next`);
  const manageToken = randomBytes(32).toString("base64url");
  const expiresAt = addMinutes(now, settings.holdMinutes);

  const [reservation] = await tx
    .insert(schema.reservation)
    .values({
      reference: `CRG-${next}`,
      manageTokenHash: hashManageToken(manageToken),
      holdExpiresAt: expiresAt,
      startsAt: slot.startsAt,
      partySize,
      status: "PENDING_PAYMENT",
      source: "ONLINE",
      selectionMode: mode,
      locale: request.locale,
      depositPerPersonCents: breakdown.depositPerPersonCents,
      billableSeats: breakdown.billableSeats,
      depositCents: breakdown.depositCents,
      tableFeeCents: breakdown.tableFeeCents,
      totalCents: breakdown.totalCents,
      creditTowardBillCents: breakdown.creditTowardBillCents,
      tableCategoryName: breakdown.tableCategoryName,
    })
    .returning();

  await tx.insert(schema.tableAllocation).values(
    chosen.tableIds.map((tableId) => ({
      tableId,
      period: toRange(slot.startsAt, slot.blockEnd),
      kind: "HOLD" as const,
      reservationId: reservation.id,
      expiresAt,
    })),
  );
  await tx
    .insert(schema.reservationEvent)
    .values({ reservationId: reservation.id, toStatus: "PENDING_PAYMENT", actor: GUEST });

  return {
    reservationId: reservation.id,
    reference: reservation.reference,
    manageToken,
    expiresAt,
    tableIds: chosen.tableIds,
    price: breakdown,
  };
}

export interface GuestDetails {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  marketingConsent?: boolean;
}

/** Stores who the held table is for. Required before payment. */
export async function attachGuestDetails(
  db: Db,
  reservationId: string,
  details: GuestDetails,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(schema.reservation)
      .where(eq(schema.reservation.id, reservationId))
      .for("update");
    if (!reservation) throw new BookingError("NOT_FOUND");
    const expired = !reservation.holdExpiresAt || reservation.holdExpiresAt.getTime() <= now.getTime();
    if (reservation.status !== "PENDING_PAYMENT" || expired) throw new BookingError("HOLD_EXPIRED");

    const [customer] = await tx
      .insert(schema.customer)
      .values({
        name: details.name.trim(),
        email: details.email.trim().toLowerCase(),
        phone: details.phone?.trim() || null,
        locale: reservation.locale,
        marketingConsent: details.marketingConsent ?? false,
      })
      .returning({ id: schema.customer.id });
    await tx
      .update(schema.reservation)
      .set({ customerId: customer.id, guestNotes: details.notes?.trim() || null, updatedAt: now })
      .where(eq(schema.reservation.id, reservationId));
  });
}

export type ConfirmResult =
  | { confirmed: true; alreadyConfirmed: boolean }
  /** The hold lapsed and the table was released; the payment must be refunded. */
  | { confirmed: false; reason: "HOLD_EXPIRED" };

/**
 * Turns a held, paid reservation into a confirmed one. Called only by the
 * verified payment webhook (or by staff creating a reservation). Idempotent.
 *
 * A payment that lands a little after the hold's expiry is still honoured as
 * long as the table has not been released to anyone else.
 */
export async function confirmReservation(
  db: Db,
  reservationId: string,
  actor: Actor = SYSTEM,
  now = new Date(),
): Promise<ConfirmResult> {
  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(schema.reservation)
      .where(eq(schema.reservation.id, reservationId))
      .for("update");
    if (!reservation) throw new BookingError("NOT_FOUND");
    if (reservation.status === "CONFIRMED") return { confirmed: true, alreadyConfirmed: true };
    if (reservation.status !== "PENDING_PAYMENT") return { confirmed: false, reason: "HOLD_EXPIRED" };
    if (!reservation.customerId) throw new BookingError("DETAILS_REQUIRED");

    await tx
      .update(schema.tableAllocation)
      .set({ kind: "RESERVATION", expiresAt: null })
      .where(and(eq(schema.tableAllocation.reservationId, reservationId), isNull(schema.tableAllocation.releasedAt)));
    await tx
      .update(schema.reservation)
      .set({ status: "CONFIRMED", updatedAt: now })
      .where(eq(schema.reservation.id, reservationId));
    await tx
      .insert(schema.reservationEvent)
      .values({ reservationId, fromStatus: "PENDING_PAYMENT", toStatus: "CONFIRMED", actor });
    return { confirmed: true, alreadyConfirmed: false };
  });
}

/** Scheduled job: expire lapsed holds so their tables show as free again. */
export async function expireHolds(db: Db, now = new Date()): Promise<string[]> {
  return db.transaction((tx) => releaseExpiredHolds(tx, now));
}
