"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { simulatedPaymentsEnabled } from "@/server/payments/mode";
import { attachGuestDetails, confirmReservation, createHold, type Selection } from "@/server/services/booking";
import { BookingError, GUEST } from "@/server/services/context";
import { cancelReservation } from "@/server/services/floor-service";
import { getReservationByToken } from "@/server/services/guest-reservation";

const holdSchema = z.object({
  locale: z.string(),
  date: z.string(),
  time: z.string(),
  guests: z.coerce.number().int(),
  mode: z.enum(["AUTO", "TABLE", "GROUP"]),
  tableId: z.string().uuid().optional(),
  combinationIds: z.string().optional(),
});

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
  return redirect({ href: `/reservation/${token}`, locale });
}

/** Guest cancels from their manage link. The refund, if due, is issued by the payment layer. */
export async function cancelByGuest(token: string, locale: string): Promise<void> {
  const found = await getReservationByToken(db, token);
  if (found && (found.reservation.status === "CONFIRMED" || found.reservation.status === "LATE")) {
    await cancelReservation(db, found.reservation.id, GUEST, new Date(), "Cancelled by guest");
  }
  return redirect({ href: `/reservation/${token}`, locale });
}
