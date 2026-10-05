"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasLocale } from "next-intl";
import { InvalidTransitionError } from "@/domain/reservation-state";
import { addMinutes, zonedTime, zonedToInstant } from "@/domain/time";
import { STAFF_LOCALE_COOKIE } from "@/i18n/request";
import { routing } from "@/i18n/routing";
import { ForbiddenError, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { BookingError, loadSettings } from "@/server/services/context";
import {
  cancelReservation,
  completeReservation,
  completeWalkIn,
  createWalkIn,
  extendWalkIn,
  markNoShow,
  seatReservation,
} from "@/server/services/floor-service";
import { stripeGateway } from "@/server/payments/gateway";
import { markNotificationsRead, notifyReservationEvent } from "@/server/services/notifications";
import { discretionaryRefund, refundPayment } from "@/server/services/payments";
import { blockTables, moveReservation, releaseBlock } from "@/server/services/table-ops";

const YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setStaffLocale(locale: string): Promise<void> {
  if (!hasLocale(routing.locales, locale)) return;
  (await cookies()).set(STAFF_LOCALE_COOKIE, locale, { maxAge: YEAR_SECONDS, sameSite: "lax", path: "/manage" });
  revalidatePath("/manage", "layout");
}

function errorCode(error: unknown): string {
  if (error instanceof BookingError) return error.code;
  if (error instanceof InvalidTransitionError) return "INVALID_TRANSITION";
  if (error instanceof ForbiddenError) return "FORBIDDEN";
  throw error;
}

/** Runs one floor action for the signed-in staff member and reports a rule failure on the page. */
async function floorAction(returnTo: string, run: (staffId: string) => Promise<unknown>): Promise<void> {
  // Only ever return to a page of the management application.
  const target = new URL(returnTo.startsWith("/manage") ? returnTo : "/manage", "http://local");
  let failure: string | null = null;
  try {
    const staff = await requirePermission("operations");
    await run(staff.id);
  } catch (error) {
    failure = errorCode(error);
  }
  if (failure) target.searchParams.set("error", failure);
  else target.searchParams.delete("error");
  revalidatePath("/manage", "layout");
  redirect(target.pathname + target.search);
}

export async function seatAction(reservationId: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, (staffId) => seatReservation(db, reservationId, staffId));
}

export async function noShowAction(reservationId: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, async (staffId) => {
    await markNoShow(db, reservationId, staffId);
    await notifyReservationEvent(db, reservationId, "NO_SHOW");
  });
}

export async function completeAction(reservationId: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, (staffId) => completeReservation(db, reservationId, staffId));
}

export async function cancelAction(reservationId: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, async (staffId) => {
    const { outcome } = await cancelReservation(db, reservationId, staffId, new Date(), "Cancelled by staff");
    const gateway = stripeGateway();
    if (gateway && outcome.refundCents > 0) {
      await refundPayment(db, gateway, reservationId, {
        amountCents: outcome.refundCents,
        reason: "POLICY",
        initiatedBy: staffId,
      });
    }
    await notifyReservationEvent(db, reservationId, "CANCELLED", { refundCents: outcome.refundCents });
  });
}

export async function completeWalkInAction(walkInId: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, () => completeWalkIn(db, walkInId));
}

const WALK_IN_EXTENSION_MINUTES = 30;

export async function extendWalkInAction(walkInId: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, (staffId) => extendWalkIn(db, walkInId, WALK_IN_EXTENSION_MINUTES, staffId));
}

const blockSchema = z.object({
  minutes: z.coerce.number().int().min(15).max(24 * 60),
  reason: z.string().max(200).optional(),
  /** YYYY-MM-DD and HH:mm in the restaurant's timezone; both empty means "from now". */
  date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  start: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).optional(),
});

/**
 * Blocks one table for the chosen duration, from now or from a given date and
 * time. This is also how the restaurant keeps a table for a guest by hand,
 * with no online reservation and no deposit.
 */
export async function blockAction(tableId: string, returnTo: string, formData: FormData): Promise<void> {
  await floorAction(returnTo, async (staffId) => {
    const parsed = blockSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) throw new BookingError("INVALID_SELECTION");
    const input = parsed.data;
    const settings = await loadSettings(db);
    const from = input.date && input.start ? zonedToInstant(input.date, input.start, settings.timezone) : new Date();
    await blockTables(db, { tableIds: [tableId], from, until: addMinutes(from, input.minutes), reason: input.reason }, staffId);
  });
}

export async function unblockAction(allocationId: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, (staffId) => releaseBlock(db, allocationId, staffId));
}

/** Moves a reservation after staff confirmed the preview. `tableIds` is comma-separated. */
export async function moveAction(reservationId: string, tableIds: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, (staffId) => moveReservation(db, reservationId, tableIds.split(","), staffId));
}

const refundSchema = z.object({ amount: z.coerce.number().positive().max(100_000), reason: z.string().trim().min(3).max(300) });

/** A manager's refund outside the cancellation policy. Needs the "refunds" permission and a reason. */
export async function refundAction(reservationId: string, returnTo: string, formData: FormData): Promise<void> {
  const target = new URL(returnTo.startsWith("/manage") ? returnTo : "/manage", "http://local");
  let failure: string | null = null;
  try {
    const staff = await requirePermission("refunds");
    const parsed = refundSchema.safeParse(Object.fromEntries(formData));
    const gateway = stripeGateway();
    if (!parsed.success || !gateway) throw new BookingError("INVALID_SELECTION");
    await discretionaryRefund(
      db,
      gateway,
      reservationId,
      { amountCents: Math.round(parsed.data.amount * 100), reason: parsed.data.reason },
      staff.id,
    );
  } catch (error) {
    failure = errorCode(error);
  }
  if (failure) target.searchParams.set("error", failure === "INVALID_SELECTION" ? "REFUND_FAILED" : failure);
  else target.searchParams.delete("error");
  revalidatePath("/manage", "layout");
  redirect(target.pathname + target.search);
}

export async function markNotificationsReadAction(): Promise<void> {
  await floorAction("/manage", () => markNotificationsRead(db));
}

const walkInSchema = z.object({
  partySize: z.coerce.number().int().min(1).max(16),
  kind: z.enum(["FOOD", "DRINKS"]),
  expectedMinutes: z.coerce.number().int().min(15).max(300),
  tableIds: z.string().min(1),
  name: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  overrideUpcoming: z.literal("on").optional(),
});

export interface WalkInState {
  error: string | null;
  /** HH:mm of the upcoming reservation (for UPCOMING_RESERVATION) or of the walk-in's end (on success). */
  time: string | null;
  created: boolean;
}

export async function createWalkInAction(_state: WalkInState, formData: FormData): Promise<WalkInState> {
  const parsed = walkInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "INVALID_SELECTION", time: null, created: false };
  const { tableIds, overrideUpcoming, ...input } = parsed.data;
  try {
    const staff = await requirePermission("operations");
    const settings = await loadSettings(db);
    const result = await createWalkIn(
      db,
      { ...input, tableIds: tableIds.split(","), overrideUpcoming: overrideUpcoming === "on" },
      staff.id,
    );
    revalidatePath("/manage");
    return { error: null, time: zonedTime(result.until, settings.timezone), created: true };
  } catch (error) {
    const code = errorCode(error);
    const startsAt = error instanceof BookingError ? error.details.startsAt : null;
    const settings = await loadSettings(db);
    return {
      error: code,
      time: startsAt instanceof Date ? zonedTime(startsAt, settings.timezone) : null,
      created: false,
    };
  }
}
