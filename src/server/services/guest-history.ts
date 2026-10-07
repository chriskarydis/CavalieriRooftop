import { desc, eq, inArray, or, sql } from "drizzle-orm";
import type { ReservationStatus } from "@/domain/reservation-state";
import * as schema from "@/server/db/schema";
import { audit, BookingError, type Actor, type Db } from "./context";

/**
 * What the restaurant knows about a returning guest. Every reservation stores
 * its own copy of the guest's details, so the same person is recognised by
 * their email address or their phone number. Notes kept about a guest (an
 * allergy, a favourite table) follow them to every reservation.
 */

/** Shorter phone numbers are not used to recognise a guest: too likely to be shared by chance. */
const MIN_PHONE_DIGITS = 8;
/** Compared without the country code. */
const PHONE_KEY_DIGITS = 10;
const MAX_NOTE = 1000;
const VISITED: ReservationStatus[] = ["SEATED", "COMPLETED"];

export interface GuestContact {
  email: string | null;
  phone: string | null;
}

export const emailKey = (email: string | null | undefined): string => {
  const value = (email ?? "").trim().toLowerCase();
  // Erased guests carry a placeholder address that must match nobody.
  return value.includes("@") && !value.endsWith("@invalid") ? value : "";
};

export const phoneKey = (phone: string | null | undefined): string => {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  return digits.length >= MIN_PHONE_DIGITS ? digits.slice(-PHONE_KEY_DIGITS) : "";
};

const phoneKeySql = sql<string>`right(regexp_replace(coalesce(${schema.customer.phone}, ''), '[^0-9]', '', 'g'), ${PHONE_KEY_DIGITS})`;
const emailKeySql = sql<string>`lower(${schema.customer.email})`;

/** Matches every customer record with this email address or this phone number; undefined when neither can be used. */
export function sameGuest(contact: GuestContact) {
  const email = emailKey(contact.email);
  const phone = phoneKey(contact.phone);
  if (!email && !phone) return undefined;
  return or(email ? eq(emailKeySql, email) : undefined, phone ? eq(phoneKeySql, phone) : undefined);
}

export interface GuestReservationRow {
  reservationId: string;
  customerId: string;
  reference: string;
  startsAt: Date;
  partySize: number;
  status: ReservationStatus;
  occasion: schema.Occasion | null;
  guestNotes: string | null;
  staffNotes: string | null;
}

interface MatchedRow extends GuestReservationRow {
  email: string;
  phone: string;
  name: string;
  profileNote: string | null;
  customerCreatedAt: Date;
}

/** Every booked reservation made with one of these addresses or phone numbers, newest first. */
async function reservationsOf(db: Db, emails: string[], phones: string[], customerIds: string[] = []): Promise<MatchedRow[]> {
  const conditions = [
    emails.length > 0 ? inArray(emailKeySql, emails) : undefined,
    phones.length > 0 ? inArray(phoneKeySql, phones) : undefined,
    customerIds.length > 0 ? inArray(schema.customer.id, customerIds) : undefined,
  ].filter((condition) => condition !== undefined);
  if (conditions.length === 0) return [];

  const rows = await db
    .select({ reservation: schema.reservation, customer: schema.customer })
    .from(schema.customer)
    .innerJoin(schema.reservation, eq(schema.reservation.customerId, schema.customer.id))
    .where(or(...conditions))
    .orderBy(desc(schema.reservation.startsAt));
  return rows
    .filter(({ reservation }) => reservation.status !== "PENDING_PAYMENT" && reservation.status !== "EXPIRED")
    .map(({ reservation, customer }) => ({
      reservationId: reservation.id,
      customerId: customer.id,
      reference: reservation.reference,
      startsAt: reservation.startsAt,
      partySize: reservation.partySize,
      status: reservation.status,
      occasion: reservation.occasion,
      guestNotes: reservation.guestNotes,
      staffNotes: reservation.staffNotes,
      email: emailKey(customer.email),
      phone: phoneKey(customer.phone),
      name: customer.name,
      profileNote: customer.notes,
      customerCreatedAt: customer.createdAt,
    }));
}

export interface GuestStats {
  /** Reservations other than the one being looked at. */
  reservations: number;
  /** Of those, the times the party came. */
  visits: number;
  noShows: number;
  cancelled: number;
  /** The restaurant's standing note about this guest, if any. */
  note: string | null;
}

const isSameGuest = (row: MatchedRow, email: string, phone: string): boolean =>
  (email !== "" && row.email === email) || (phone !== "" && row.phone === phone);

function summarise(rows: MatchedRow[], exceptReservationId?: string): GuestStats {
  const others = rows.filter((row) => row.reservationId !== exceptReservationId);
  const count = (statuses: ReservationStatus[]) => others.filter((row) => statuses.includes(row.status)).length;
  const noted = [...rows].sort((a, b) => b.customerCreatedAt.getTime() - a.customerCreatedAt.getTime()).find((row) => row.profileNote);
  return {
    reservations: others.length,
    visits: count(VISITED),
    noShows: count(["NO_SHOW"]),
    cancelled: count(["CANCELLED"]),
    note: noted?.profileNote ?? null,
  };
}

/**
 * History for a list of reservations at once. Returns a lookup: what is known
 * about the guest of one reservation, leaving that reservation itself out.
 */
export async function loadGuestStats(
  db: Db,
  guests: GuestContact[],
): Promise<(guest: GuestContact, exceptReservationId?: string) => GuestStats> {
  const emails = [...new Set(guests.map((guest) => emailKey(guest.email)).filter(Boolean))];
  const phones = [...new Set(guests.map((guest) => phoneKey(guest.phone)).filter(Boolean))];
  const rows = await reservationsOf(db, emails, phones);
  return (guest, exceptReservationId) => {
    const email = emailKey(guest.email);
    const phone = phoneKey(guest.phone);
    return summarise(
      rows.filter((row) => isSameGuest(row, email, phone)),
      exceptReservationId,
    );
  };
}

export interface GuestProfile {
  customerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  stats: GuestStats;
  reservations: GuestReservationRow[];
}

/** Everything about the guest behind one reservation's customer record. */
export async function getGuestProfile(db: Db, customerId: string): Promise<GuestProfile | null> {
  const [customer] = await db.select().from(schema.customer).where(eq(schema.customer.id, customerId));
  if (!customer) return null;
  const email = emailKey(customer.email);
  const phone = phoneKey(customer.phone);
  const rows = await reservationsOf(db, email ? [email] : [], phone ? [phone] : [], [customerId]);
  return {
    customerId,
    name: customer.name,
    email: email || null,
    phone: customer.phone,
    stats: summarise(rows),
    reservations: rows,
  };
}

/** Sets the standing note about a guest, on every record of theirs so it shows whichever reservation is opened. */
export async function saveGuestNote(db: Db, customerId: string, note: string, actor: Actor): Promise<void> {
  const text = note.trim().slice(0, MAX_NOTE) || null;
  await db.transaction(async (tx) => {
    const [customer] = await tx.select().from(schema.customer).where(eq(schema.customer.id, customerId));
    if (!customer || customer.anonymisedAt) throw new BookingError("NOT_FOUND");
    const email = emailKey(customer.email);
    const phone = phoneKey(customer.phone);
    await tx
      .update(schema.customer)
      .set({ notes: text })
      .where(
        or(
          eq(schema.customer.id, customerId),
          email ? eq(emailKeySql, email) : undefined,
          phone ? eq(phoneKeySql, phone) : undefined,
        ),
      );
    // The note itself may hold health details, so the log records only that it changed.
    await audit(tx, { actor, action: "customer.note_changed", entityType: "customer", entityId: customerId, after: { hasNote: text !== null } });
  });
}

/** The restaurant's own note on one reservation (a cake ordered, a late arrival agreed). */
export async function saveReservationNote(db: Db, reservationId: string, note: string, actor: Actor, now = new Date()): Promise<void> {
  const text = note.trim().slice(0, MAX_NOTE) || null;
  const updated = await db
    .update(schema.reservation)
    .set({ staffNotes: text, updatedAt: now })
    .where(eq(schema.reservation.id, reservationId))
    .returning({ id: schema.reservation.id });
  if (updated.length === 0) throw new BookingError("NOT_FOUND");
  await audit(db, { actor, action: "reservation.note_changed", entityType: "reservation", entityId: reservationId, after: { hasNote: text !== null } });
}
