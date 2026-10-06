import { and, eq, gt, lt, sql } from "drizzle-orm";
import { addMinutes } from "@/domain/time";
import * as schema from "@/server/db/schema";
import { manageTokenFor } from "./booking";
import type { Db } from "./context";

/**
 * Lets a guest who has lost their link open their reservation with its number
 * and the email address or phone number they booked with. The number alone is
 * never enough, and guesses are limited per network address, because numbers
 * run in sequence and whoever opens a reservation can cancel it.
 */

export const LOOKUP_ATTEMPTS = 8;
export const LOOKUP_WINDOW_MINUTES = 15;
const KEEP_ATTEMPTS_MINUTES = 24 * 60;
/** Shorter phone numbers are not accepted as proof: too easy to guess. */
const MIN_PHONE_DIGITS = 8;

export type LookupResult = { found: true; token: string } | { found: false; reason: "NOT_FOUND" | "TOO_MANY_ATTEMPTS" };

/** "crg-1000", "CRG 1000" and "1000" all mean CRG-1000. */
export function normaliseReference(input: string): string {
  const compact = input.toUpperCase().replace(/\s+/g, "");
  if (/^\d+$/.test(compact)) return `CRG-${compact}`;
  return compact.replace(/^CRG-?/, "CRG-");
}

const digits = (value: string): string => value.replace(/\D/g, "");

/** Whether what the guest typed is the email or the phone number on the reservation. */
export function contactMatches(input: string, customer: { email: string; phone: string | null }): boolean {
  const typed = input.trim();
  if (typed.includes("@")) return typed.toLowerCase() === customer.email.toLowerCase();
  const typedDigits = digits(typed);
  const stored = digits(customer.phone ?? "");
  if (typedDigits.length < MIN_PHONE_DIGITS || stored.length < MIN_PHONE_DIGITS) return false;
  // With or without the country code.
  return stored.endsWith(typedDigits) || typedDigits.endsWith(stored);
}

export async function findReservation(
  db: Db,
  input: { reference: string; contact: string; ipHash: string | null },
  now = new Date(),
): Promise<LookupResult> {
  const ipHash = input.ipHash ?? "unknown";
  await db.delete(schema.lookupAttempt).where(lt(schema.lookupAttempt.createdAt, addMinutes(now, -KEEP_ATTEMPTS_MINUTES)));
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.lookupAttempt)
    .where(and(eq(schema.lookupAttempt.ipHash, ipHash), gt(schema.lookupAttempt.createdAt, addMinutes(now, -LOOKUP_WINDOW_MINUTES))));
  if (count >= LOOKUP_ATTEMPTS) return { found: false, reason: "TOO_MANY_ATTEMPTS" };
  await db.insert(schema.lookupAttempt).values({ ipHash, createdAt: now });

  const [row] = await db
    .select({ id: schema.reservation.id, status: schema.reservation.status, email: schema.customer.email, phone: schema.customer.phone })
    .from(schema.reservation)
    .innerJoin(schema.customer, eq(schema.reservation.customerId, schema.customer.id))
    .where(eq(schema.reservation.reference, normaliseReference(input.reference)));
  // The same answer whether the number does not exist or the contact is wrong.
  if (!row || row.status === "PENDING_PAYMENT" || row.status === "EXPIRED" || !contactMatches(input.contact, row)) {
    return { found: false, reason: "NOT_FOUND" };
  }
  return { found: true, token: manageTokenFor(row.id) };
}
