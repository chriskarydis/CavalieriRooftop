import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { audit, loadSettings, SYSTEM, type Db } from "./context";

const BATCH = 200;
const REMOVED_NAME = "Removed";

/**
 * Data retention: once every reservation of a guest is older than the
 * configured number of months, their name, email, phone and notes are erased.
 * The reservation rows stay, so the restaurant's figures remain complete.
 * Does nothing while no retention period is set.
 */
export async function anonymiseOldGuests(db: Db, now = new Date()): Promise<number> {
  const settings = await loadSettings(db);
  if (settings.retentionMonths === null) return 0;

  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - settings.retentionMonths);

  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: schema.customer.id })
      .from(schema.customer)
      .where(
        and(
          isNull(schema.customer.anonymisedAt),
          sql`NOT EXISTS (
            SELECT 1 FROM ${schema.reservation}
            WHERE ${schema.reservation.customerId} = ${schema.customer.id}
              AND ${schema.reservation.startsAt} >= ${cutoff.toISOString()}::timestamptz
          )`,
          // A guest whose hold never became a reservation is covered by their creation date.
          sql`${schema.customer.createdAt} < ${cutoff.toISOString()}::timestamptz`,
        ),
      )
      .limit(BATCH);
    if (due.length === 0) return 0;
    const ids = due.map((row) => row.id);

    for (const id of ids) {
      await tx
        .update(schema.customer)
        .set({
          name: REMOVED_NAME,
          // Kept unique and obviously not an address.
          email: `removed-${id}@invalid`,
          phone: null,
          notes: null,
          marketingConsent: false,
          anonymisedAt: now,
        })
        .where(eq(schema.customer.id, id));
    }
    await tx
      .update(schema.reservation)
      .set({ guestNotes: null, staffNotes: null })
      .where(inArray(schema.reservation.customerId, ids));
    await audit(tx, {
      actor: SYSTEM,
      action: "customer.anonymised",
      entityType: "customer",
      entityId: ids[0],
      after: { count: ids.length, retentionMonths: settings.retentionMonths },
    });
    return ids.length;
  });
}
