import { asc, eq } from "drizzle-orm";
import { cancellationOutcome, type CancellationOutcome } from "@/domain/cancellation";
import * as schema from "@/server/db/schema";
import { hashManageToken } from "./booking";
import { loadSettings, type Db, type ReservationRow, type Settings } from "./context";

export interface GuestReservation {
  reservation: ReservationRow;
  customer: { name: string; email: string; phone: string | null } | null;
  /** Numbers of every table ever allocated to this reservation, ascending. */
  tableNumbers: number[];
  settings: Settings;
  /** The table is still held for this unpaid reservation. */
  holdActive: boolean;
  /** What cancelling right now would refund. */
  cancellation: CancellationOutcome;
}

/**
 * Looks a reservation up by the secret token from the guest's link. The
 * reference number alone is never enough to open a reservation.
 */
export async function getReservationByToken(db: Db, token: string, now = new Date()): Promise<GuestReservation | null> {
  if (!token) return null;
  const [row] = await db
    .select({ reservation: schema.reservation, customer: schema.customer })
    .from(schema.reservation)
    .leftJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
    .where(eq(schema.reservation.manageTokenHash, hashManageToken(token)));
  if (!row) return null;

  const [tables, settings] = await Promise.all([
    db
      .selectDistinct({ number: schema.diningTable.number })
      .from(schema.tableAllocation)
      .innerJoin(schema.diningTable, eq(schema.tableAllocation.tableId, schema.diningTable.id))
      .where(eq(schema.tableAllocation.reservationId, row.reservation.id))
      .orderBy(asc(schema.diningTable.number)),
    loadSettings(db),
  ]);

  return {
    reservation: row.reservation,
    customer: row.customer
      ? { name: row.customer.name, email: row.customer.email, phone: row.customer.phone }
      : null,
    tableNumbers: tables.map((table) => table.number),
    settings,
    holdActive:
      row.reservation.status === "PENDING_PAYMENT" &&
      row.reservation.holdExpiresAt !== null &&
      row.reservation.holdExpiresAt.getTime() > now.getTime(),
    cancellation: cancellationOutcome({
      startsAt: row.reservation.startsAt,
      now,
      refundCutoffHours: settings.refundCutoffHours,
      paidCents: row.reservation.totalCents,
    }),
  };
}
