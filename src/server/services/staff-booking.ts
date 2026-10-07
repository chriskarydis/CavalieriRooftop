import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { findCandidates } from "@/domain/allocation";
import { addMinutes, closedReason, toRange, zonedToInstant } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { hashManageToken, manageTokenFor } from "./booking";
import {
  audit,
  BookingError,
  busyTables,
  isOverlapViolation,
  loadFloorConfig,
  loadSettings,
  lockAllocations,
  type Actor,
  type Db,
} from "./context";
import { assertConfiguredSeating } from "./floor-service";

/**
 * A reservation staff take by hand, for a guest on the phone or at the door.
 * The owner's rule: no deposit and no table fee, nothing is paid online. It
 * otherwise behaves like any reservation (lists, timeline, live floor, seat,
 * no-show, move), and the guest is emailed a confirmation if an address is
 * given. Staff may book any time of day and any party size the tables hold.
 */

export interface StaffReservationInput {
  /** YYYY-MM-DD and HH:mm in the restaurant's timezone. */
  date: string;
  time: string;
  partySize: number;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  /** Language of the guest's emails. */
  locale: string;
  /** Table ids; empty to take the best free table or tables. */
  tableIds: string[];
}

export interface StaffReservationResult {
  reservationId: string;
  reference: string;
  tableIds: string[];
}

/** How long a reservation may start before now and still be taken (a party already walking in). */
const LATE_ENTRY_MINUTES = 15;

export async function createStaffReservation(
  db: Db,
  input: StaffReservationInput,
  actor: Actor,
  now = new Date(),
): Promise<StaffReservationResult> {
  const name = input.name.trim();
  if (!name || !Number.isInteger(input.partySize) || input.partySize < 1) throw new BookingError("INVALID_SELECTION");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) throw new BookingError("INVALID_SLOT");

  try {
    return await db.transaction(async (tx) => {
      await lockAllocations(tx);
      const settings = await loadSettings(tx);
      const closures = await tx.select({ date: schema.closure.date }).from(schema.closure).where(eq(schema.closure.date, input.date));
      if (closedReason(input.date, settings, new Set(closures.map((row) => row.date)))) throw new BookingError("CLOSED");

      const startsAt = zonedToInstant(input.date, input.time, settings.timezone);
      if (startsAt.getTime() < addMinutes(now, -LATE_ENTRY_MINUTES).getTime()) throw new BookingError("IN_THE_PAST");
      const blockEnd = addMinutes(startsAt, settings.blockMinutes);

      const config = await loadFloorConfig(tx);
      const busy = await busyTables(tx, startsAt, blockEnd, now);
      let tableIds: string[];
      if (input.tableIds.length > 0) {
        assertConfiguredSeating(config, input.tableIds, input.partySize);
        if (input.tableIds.some((id) => busy.has(id))) throw new BookingError("TABLE_UNAVAILABLE");
        tableIds = input.tableIds;
      } else {
        const [best] = findCandidates({ partySize: input.partySize, ...config, busyTableIds: new Set(busy.keys()), purpose: "STAFF" });
        if (!best) throw new BookingError("NO_AVAILABILITY");
        tableIds = [...best.tableIds];
      }

      const [{ next }] = await tx.execute<{ next: string }>(sql`SELECT nextval('reservation_reference_seq') AS next`);
      const reservationId = randomUUID();
      const [customer] = await tx
        .insert(schema.customer)
        .values({
          name,
          // The address is optional here; without one no email is sent.
          email: input.email?.trim().toLowerCase() ?? "",
          phone: input.phone?.trim() || null,
          locale: input.locale,
        })
        .returning({ id: schema.customer.id });
      const [reservation] = await tx
        .insert(schema.reservation)
        .values({
          id: reservationId,
          reference: `CRG-${next}`,
          manageTokenHash: hashManageToken(manageTokenFor(reservationId)),
          customerId: customer.id,
          createdAt: now,
          startsAt,
          partySize: input.partySize,
          status: "CONFIRMED",
          source: "STAFF",
          selectionMode: "AUTO",
          tableSetByStaff: true,
          locale: input.locale,
          staffNotes: input.notes?.trim() || null,
          depositPerPersonCents: 0,
          billableSeats: input.partySize,
          depositCents: 0,
          tableFeeCents: 0,
          totalCents: 0,
          creditTowardBillCents: 0,
        })
        .returning({ id: schema.reservation.id, reference: schema.reservation.reference });
      await tx.insert(schema.tableAllocation).values(
        tableIds.map((tableId) => ({
          tableId,
          period: toRange(startsAt, blockEnd),
          kind: "RESERVATION" as const,
          reservationId,
        })),
      );
      await tx.insert(schema.reservationEvent).values({ reservationId, toStatus: "CONFIRMED", actor, reason: "Taken by staff, no deposit" });
      await audit(tx, {
        actor,
        action: "reservation.created_by_staff",
        entityType: "reservation",
        entityId: reservationId,
        after: { startsAt, partySize: input.partySize, tableIds },
      });
      return { reservationId: reservation.id, reference: reservation.reference, tableIds };
    });
  } catch (error) {
    if (isOverlapViolation(error)) throw new BookingError("TABLE_UNAVAILABLE");
    throw error;
  }
}
