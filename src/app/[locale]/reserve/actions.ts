"use server";

import { createHmac, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { stripeGateway } from "@/server/payments/gateway";
import { simulatedPaymentsEnabled } from "@/server/payments/mode";
import {
  attachGuestDetails,
  confirmReservation,
  createHold,
  type Holder,
  type Selection,
} from "@/server/services/booking";
import { BookingError, GUEST } from "@/server/services/context";
import { cancelReservation } from "@/server/services/floor-service";
import { getReservationByToken } from "@/server/services/guest-reservation";
import { notifyReservationEvent } from "@/server/services/notifications";
import { refundPayment } from "@/server/services/payments";
import { rescheduleReservation } from "@/server/services/reschedule";

const holdSchema = z.object({
  locale: z.string(),
  date: z.string(),
  time: z.string(),
  guests: z.coerce.number().int(),
  mode: z.enum(["AUTO", "TABLE", "GROUP"]),
  tableId: z.string().uuid().optional(),
  combinationIds: z.string().optional(),
});

const HOLDER_COOKIE = "crg_guest";
const HOLDER_COOKIE_DAYS = 30;

/**
 * Identifies the visitor for the one-hold-at-a-time rule: a random id in an
 * HttpOnly cookie, plus a keyed hash of their IP address (never the address
 * itself) for the per-address cap.
 */
async function currentHolder(): Promise<Holder> {
  const jar = await cookies();
  let id = jar.get(HOLDER_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id = randomUUID();
    jar.set(HOLDER_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: HOLDER_COOKIE_DAYS * 24 * 60 * 60,
      path: "/",
    });
  }
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  const secret = process.env.MANAGE_TOKEN_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "";
  const ipHash = forwarded ? createHmac("sha256", secret).update(`ip:${forwarded}`).digest("hex") : null;
  return { id, ipHash };
}

/** Step 2 -> 3: hold the selection for the guest and move to checkout. */
export async function startHold(formData: FormData): Promise<void> {
  const input = holdSchema.parse(Object.fromEntries(formData));
  const query = { date: input.date, time: input.time, guests: String(input.guests) };

  let selection: Selection;
  if (input.mode === "TABLE" && input.tableId) selection = { mode: "TABLE", tableId: input.tableId };
  else if (input.mode === "GROUP" && input.combinationIds) {
    selection = { mode: "GROUP", combinationIds: z.array(z.string().uuid()).parse(input.combinationIds.split(",")) };
  } else selection = { mode: "AUTO" };

  let token: string;
  try {
    const hold = await createHold(db, {
      date: input.date,
      time: input.time,
      partySize: input.guests,
      selection,
      locale: input.locale,
      holder: await currentHolder(),
    });
    token = hold.manageToken;
  } catch (error) {
    if (!(error instanceof BookingError)) throw error;
    return redirect({ href: { pathname: "/reserve", query: { ...query, error: error.code } }, locale: input.locale });
  }
  return redirect({ href: `/reserve/${token}`, locale: input.locale });
}

const detailsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(6).max(40),
  notes: z.string().trim().max(500).optional(),
  acceptPolicy: z.literal("on"),
});

export interface DetailsState {
  error: "INVALID" | "HOLD_EXPIRED" | null;
}

/** Step 3: who the table is for. */
export async function submitDetails(token: string, locale: string, _state: DetailsState, formData: FormData): Promise<DetailsState> {
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "INVALID" };
  const found = await getReservationByToken(db, token);
  if (!found) return { error: "HOLD_EXPIRED" };
  try {
    await attachGuestDetails(db, found.reservation.id, parsed.data);
  } catch (error) {
    if (error instanceof BookingError) return { error: "HOLD_EXPIRED" };
    throw error;
  }
  return redirect({ href: `/reserve/${token}`, locale });
}

/**
 * Development stand-in for the payment step. Refuses to run unless simulated
 * payments are explicitly enabled outside production.
 */
export async function simulatePayment(token: string, locale: string): Promise<void> {
  if (!simulatedPaymentsEnabled()) throw new Error("Simulated payments are disabled");
  const found = await getReservationByToken(db, token);
  if (!found) return redirect({ href: "/reserve", locale });
  const result = await confirmReservation(db, found.reservation.id, "simulated-payment");
  if (!result.confirmed) return redirect({ href: `/reserve/${token}`, locale });
  if (!result.alreadyConfirmed) await notifyReservationEvent(db, found.reservation.id, "CONFIRMED");
  return redirect({ href: `/reservation/${token}`, locale });
}

/** Guest moves their confirmed reservation to another date or time, from their manage link. */
export async function moveByGuest(token: string, formData: FormData): Promise<void> {
  const input = holdSchema.parse(Object.fromEntries(formData));
  const found = await getReservationByToken(db, token);
  if (!found) return redirect({ href: "/reserve", locale: input.locale });

  let selection: Selection;
  if (input.mode === "TABLE" && input.tableId) selection = { mode: "TABLE", tableId: input.tableId };
  else if (input.mode === "GROUP" && input.combinationIds) {
    selection = { mode: "GROUP", combinationIds: z.array(z.string().uuid()).parse(input.combinationIds.split(",")) };
  } else selection = { mode: "AUTO" };

  try {
    await rescheduleReservation(db, found.reservation.id, { date: input.date, time: input.time, selection });
  } catch (error) {
    if (!(error instanceof BookingError)) throw error;
    const query = new URLSearchParams({ date: input.date, time: input.time, error: error.code });
    return redirect({ href: `/reservation/${token}/move?${query}`, locale: input.locale });
  }
  await notifyReservationEvent(db, found.reservation.id, "RESCHEDULED");
  return redirect({ href: `/reservation/${token}?moved=1`, locale: input.locale });
}

/** Guest cancels from their manage link. The refund, if due, is issued by the payment layer. */
export async function cancelByGuest(token: string, locale: string): Promise<void> {
  const found = await getReservationByToken(db, token);
  if (found && (found.reservation.status === "CONFIRMED" || found.reservation.status === "LATE")) {
    const { outcome } = await cancelReservation(db, found.reservation.id, GUEST, new Date(), "Cancelled by guest");
    const gateway = stripeGateway();
    if (gateway && outcome.refundCents > 0) {
      await refundPayment(db, gateway, found.reservation.id, {
        amountCents: outcome.refundCents,
        reason: "POLICY",
        initiatedBy: GUEST,
      });
    }
    await notifyReservationEvent(db, found.reservation.id, "CANCELLED", { refundCents: outcome.refundCents });
  }
  return redirect({ href: `/reservation/${token}`, locale });
}
