import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { toRange } from "@/domain/time";
import * as schema from "@/server/db/schema";
import type { EmailTransport } from "@/server/email/transport";
import type { PaymentGateway } from "@/server/payments/gateway";
import { loadSettings, type Actor, type Db } from "./context";
import { cancelReservation } from "./floor-service";
import { notifyReservationEvent } from "./notifications";
import { refundPayment } from "./payments";
import { servicePeriod } from "./table-ops";

/**
 * The restaurant closes tables for certain days and has chosen, in its
 * settings, to cancel the reservations on them itself. Because the restaurant
 * is the one cancelling, each guest is refunded everything they paid, however
 * close the date is, and is told by email why.
 *
 * Only reservations that are still to come are touched: a party that is
 * already seated stays as it is.
 */

export interface ClosureCancellations {
  cancelled: number;
  refundedCents: number;
  /** Cancelled reservations whose payment could not be refunded here and must be refunded by hand. */
  unrefunded: number;
}

export async function cancelForClosedDays(
  db: Db,
  gateway: PaymentGateway | null,
  input: { tableIds: string[]; from: string; to: string },
  actor: Actor,
  now = new Date(),
  transport?: EmailTransport,
): Promise<ClosureCancellations> {
  const result: ClosureCancellations = { cancelled: 0, refundedCents: 0, unrefunded: 0 };
  if (input.tableIds.length === 0) return result;
  const settings = await loadSettings(db);
  const { start, end } = servicePeriod(input.from, input.to, settings.timezone);

  const due = await db
    .selectDistinct({ id: schema.reservation.id, totalCents: schema.reservation.totalCents })
    .from(schema.tableAllocation)
    .innerJoin(schema.reservation, eq(schema.tableAllocation.reservationId, schema.reservation.id))
    .where(
      and(
        inArray(schema.tableAllocation.tableId, input.tableIds),
        eq(schema.tableAllocation.kind, "RESERVATION"),
        isNull(schema.tableAllocation.releasedAt),
        inArray(schema.reservation.status, ["CONFIRMED", "LATE"]),
        sql`${schema.tableAllocation.period} && ${toRange(start, end)}::tstzrange`,
      ),
    );

  for (const reservation of due) {
    await cancelReservation(db, reservation.id, actor, now, "Restaurant closed on that day");
    let refundedCents = 0;
    if (reservation.totalCents > 0) {
      const refund = gateway
        ? await refundPayment(db, gateway, reservation.id, {
            amountCents: reservation.totalCents,
            reason: "Restaurant closed on that day",
            initiatedBy: actor,
            now,
          })
        : null;
      refundedCents = refund?.refundedCents ?? 0;
      if (refundedCents < reservation.totalCents) result.unrefunded++;
    }
    result.cancelled++;
    result.refundedCents += refundedCents;
    await notifyReservationEvent(db, reservation.id, "CANCELLED_BY_RESTAURANT", { refundCents: refundedCents, transport });
  }
  return result;
}
