"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasLocale } from "next-intl";
import { InvalidTransitionError } from "@/domain/reservation-state";
import { zonedTime } from "@/domain/time";
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
  markNoShow,
  seatReservation,
} from "@/server/services/floor-service";

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
async function floorAction(run: (staffId: string) => Promise<unknown>): Promise<void> {
  let failure: string | null = null;
  try {
    const staff = await requirePermission("operations");
    await run(staff.id);
  } catch (error) {
    failure = errorCode(error);
  }
  revalidatePath("/manage");
  redirect(failure ? `/manage?error=${failure}` : "/manage");
}

export async function seatAction(reservationId: string): Promise<void> {
  await floorAction((staffId) => seatReservation(db, reservationId, staffId));
}

export async function noShowAction(reservationId: string): Promise<void> {
  await floorAction((staffId) => markNoShow(db, reservationId, staffId));
}

export async function completeAction(reservationId: string): Promise<void> {
  await floorAction((staffId) => completeReservation(db, reservationId, staffId));
}

export async function cancelAction(reservationId: string): Promise<void> {
  await floorAction((staffId) => cancelReservation(db, reservationId, staffId, new Date(), "Cancelled by staff"));
}

export async function completeWalkInAction(walkInId: string): Promise<void> {
  await floorAction(() => completeWalkIn(db, walkInId));
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
