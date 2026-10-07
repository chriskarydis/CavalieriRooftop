import { and, asc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { addMinutes, zonedDate } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { renderWaitingEmail } from "@/server/email/templates";
import { sendEmail, type EmailTransport } from "@/server/email/transport";
import { getAvailability, type Availability, type SlotRequest } from "./booking";
import { audit, BookingError, loadSettings, type Actor, type Db } from "./context";

/**
 * The waiting list for full evenings. A guest who finds nothing free leaves
 * their details; when a table that fits them becomes free they are sent an
 * email with a link to book it. Nothing is held for them and nothing is paid:
 * whoever books first has the table.
 *
 * One guest is told at a time per evening, in the order they joined. If they
 * have not booked within RENOTIFY_MINUTES the next one is told as well.
 */

/** Most guests that may wait for one evening. */
export const WAITING_LIMIT_PER_DATE = 40;
/** How long the guest told first has before the next one is told too. */
export const RENOTIFY_MINUTES = 120;

/** Most requests to join from one network address in the window below. */
export const JOIN_ATTEMPTS = 5;
const JOIN_WINDOW_MINUTES = 15;

/**
 * Counts a request to join against the visitor's (hashed) network address and
 * says whether it may go ahead, so the list cannot be filled by a script.
 */
export async function mayJoin(db: Db, ipHash: string | null, now = new Date()): Promise<boolean> {
  const key = `waiting:${ipHash ?? "unknown"}`;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.lookupAttempt)
    .where(and(eq(schema.lookupAttempt.ipHash, key), gt(schema.lookupAttempt.createdAt, addMinutes(now, -JOIN_WINDOW_MINUTES))));
  if (count >= JOIN_ATTEMPTS) return false;
  await db.insert(schema.lookupAttempt).values({ ipHash: key, createdAt: now });
  return true;
}

export type WaitingEntry = typeof schema.waitingEntry.$inferSelect;

export interface JoinInput extends SlotRequest {
  name: string;
  email: string;
  phone?: string;
  locale: string;
}

export type JoinResult = { joined: true; id: string } | { joined: false; reason: "AVAILABLE" | "LIST_FULL" };

export function hasFreeTable(availability: Availability): boolean {
  return availability.auto !== null || availability.groups.length > 0 || availability.tables.some((table) => table.state === "AVAILABLE");
}

/**
 * Adds a guest to the waiting list of an evening, only when nothing is free
 * for their party at that time. Asking again for the same evening with the
 * same address updates the entry instead of adding another.
 */
export async function joinWaitingList(db: Db, input: JoinInput, now = new Date()): Promise<JoinResult> {
  // Throws for a closed day, a time that is not offered, a past time or a party outside the online limits.
  const availability = await getAvailability(db, input, now);
  if (hasFreeTable(availability)) return { joined: false, reason: "AVAILABLE" };

  const email = input.email.trim().toLowerCase();
  const values = {
    time: input.time,
    partySize: input.partySize,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    locale: input.locale,
    status: "WAITING" as const,
    notifiedAt: null,
  };
  const active = await db
    .select()
    .from(schema.waitingEntry)
    .where(and(eq(schema.waitingEntry.date, input.date), inArray(schema.waitingEntry.status, ["WAITING", "NOTIFIED"])));
  const own = active.find((entry) => entry.email === email);
  if (own) {
    await db.update(schema.waitingEntry).set(values).where(eq(schema.waitingEntry.id, own.id));
    return { joined: true, id: own.id };
  }
  if (active.length >= WAITING_LIMIT_PER_DATE) return { joined: false, reason: "LIST_FULL" };

  const [created] = await db
    .insert(schema.waitingEntry)
    .values({ ...values, date: input.date, email, createdAt: now })
    .returning({ id: schema.waitingEntry.id });
  await db.insert(schema.notification).values({
    type: "WAITING_JOINED",
    payload: {
      reference: "",
      guestName: values.name,
      partySize: input.partySize,
      startsAt: availability.startsAt.toISOString(),
      tableNumbers: [],
    },
  });
  return { joined: true, id: created.id };
}

/**
 * Entries whose guest has since booked that evening are marked as booked, so
 * they are not told again and staff see how it ended.
 */
async function markBooked(db: Db): Promise<void> {
  const settings = await loadSettings(db);
  await db.execute(sql`
    UPDATE ${schema.waitingEntry} AS w SET status = 'BOOKED'
    WHERE w.status IN ('WAITING', 'NOTIFIED')
      AND EXISTS (
        SELECT 1 FROM ${schema.reservation} r
        JOIN ${schema.customer} c ON c.id = r.customer_id
        WHERE lower(c.email) = w.email
          AND r.status IN ('CONFIRMED', 'LATE', 'SEATED', 'COMPLETED')
          AND r.created_at >= w.created_at
          AND to_char(r.starts_at AT TIME ZONE ${settings.timezone}, 'YYYY-MM-DD') = w.date
      )`);
}

/** The waiting list of one evening for staff, in the order guests joined. Removed entries are left out. */
export async function listWaiting(db: Db, date: string): Promise<WaitingEntry[]> {
  await markBooked(db);
  return db
    .select()
    .from(schema.waitingEntry)
    .where(and(eq(schema.waitingEntry.date, date), inArray(schema.waitingEntry.status, ["WAITING", "NOTIFIED", "BOOKED"])))
    .orderBy(asc(schema.waitingEntry.createdAt));
}

export async function removeWaiting(db: Db, entryId: string, actor: Actor): Promise<void> {
  const removed = await db
    .update(schema.waitingEntry)
    .set({ status: "REMOVED" })
    .where(eq(schema.waitingEntry.id, entryId))
    .returning({ id: schema.waitingEntry.id });
  if (removed.length === 0) throw new BookingError("NOT_FOUND");
  await audit(db, { actor, action: "waiting.removed", entityType: "waiting_entry", entityId: entryId });
}

async function tell(db: Db, entry: WaitingEntry, timezone: string, now: Date, transport: EmailTransport): Promise<void> {
  const [claimed] = await db
    .insert(schema.emailLog)
    .values({
      idempotencyKey: `waiting:${entry.id}:${now.toISOString()}`,
      template: "guest_waiting",
      recipient: entry.email,
      locale: entry.locale,
      status: "PENDING",
    })
    .returning({ id: schema.emailLog.id });
  await db.update(schema.waitingEntry).set({ status: "NOTIFIED", notifiedAt: now }).where(eq(schema.waitingEntry.id, entry.id));
  try {
    const result = await transport({
      to: entry.email,
      ...renderWaitingEmail({ locale: entry.locale, name: entry.name, date: entry.date, time: entry.time, partySize: entry.partySize, timezone }),
    });
    await db.update(schema.emailLog).set({ status: result.status, providerId: result.providerId }).where(eq(schema.emailLog.id, claimed.id));
  } catch (error) {
    await db
      .update(schema.emailLog)
      .set({ status: "FAILED", error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" })
      .where(eq(schema.emailLog.id, claimed.id));
  }
}

/** Whether a table that fits this entry can be booked right now. */
async function canBook(db: Db, entry: WaitingEntry, now: Date): Promise<boolean> {
  try {
    return hasFreeTable(await getAvailability(db, { date: entry.date, time: entry.time, partySize: entry.partySize }, now));
  } catch (error) {
    // The time has passed, the day was closed, or the settings changed: nothing to offer.
    if (error instanceof BookingError) return false;
    throw error;
  }
}

/**
 * Tells waiting guests about tables that have become free. Run after every
 * cancellation or move, and by the scheduled job. Returns how many were told.
 */
export async function notifyWaitingList(db: Db, now = new Date(), transport: EmailTransport = sendEmail): Promise<number> {
  await markBooked(db);
  const settings = await loadSettings(db);
  const today = zonedDate(now, settings.timezone);
  const entries = await db
    .select()
    .from(schema.waitingEntry)
    .where(and(gte(schema.waitingEntry.date, today), inArray(schema.waitingEntry.status, ["WAITING", "NOTIFIED"])))
    .orderBy(asc(schema.waitingEntry.createdAt));

  const recently = addMinutes(now, -RENOTIFY_MINUTES).getTime();
  let told = 0;
  for (const date of new Set(entries.map((entry) => entry.date))) {
    const evening = entries.filter((entry) => entry.date === date);
    // Someone was told a short while ago and may be booking: the others wait their turn.
    if (evening.some((entry) => entry.status === "NOTIFIED" && (entry.notifiedAt?.getTime() ?? 0) > recently)) continue;
    for (const entry of evening.filter((candidate) => candidate.status === "WAITING")) {
      if (!(await canBook(db, entry, now))) continue;
      await tell(db, entry, settings.timezone, now, transport);
      told++;
      break;
    }
  }
  return told;
}

/** Staff tell one guest by hand, whatever their place in the list. */
export async function notifyWaitingEntry(db: Db, entryId: string, actor: Actor, now = new Date(), transport: EmailTransport = sendEmail): Promise<void> {
  const [entry] = await db.select().from(schema.waitingEntry).where(eq(schema.waitingEntry.id, entryId));
  if (!entry || entry.status === "REMOVED" || entry.status === "BOOKED") throw new BookingError("NOT_FOUND");
  const settings = await loadSettings(db);
  await tell(db, entry, settings.timezone, now, transport);
  await audit(db, { actor, action: "waiting.notified", entityType: "waiting_entry", entityId: entryId });
}

/** An evening's service runs past midnight; its list is kept until this many hours into the next day. */
const KEEP_UNTIL_HOUR = 6;

/** Scheduled job: the list of an evening is deleted the day after, since it has no further use. */
export async function purgeWaitingList(db: Db, now = new Date()): Promise<number> {
  const settings = await loadSettings(db);
  const removed = await db
    .delete(schema.waitingEntry)
    .where(lt(schema.waitingEntry.date, zonedDate(addMinutes(now, -KEEP_UNTIL_HOUR * 60), settings.timezone)))
    .returning({ id: schema.waitingEntry.id });
  return removed.length;
}
