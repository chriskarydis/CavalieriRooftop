"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasLocale } from "next-intl";
import { InvalidTransitionError } from "@/domain/reservation-state";
import { addMinutes, blockStart, zonedDate, zonedTime, zonedToInstant } from "@/domain/time";
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
  moveWalkIn,
  markNoShow,
  seatReservation,
} from "@/server/services/floor-service";
import { stripeGateway } from "@/server/payments/gateway";
import { saveGuestNote, saveReservationNote } from "@/server/services/guest-history";
import { markNotificationsRead, notifyReservationEvent } from "@/server/services/notifications";
import { notifyWaitingEntry, notifyWaitingList, removeWaiting } from "@/server/services/waiting-list";
import { OCCASIONS } from "@/server/db/schema";
import { discretionaryRefund, refundPayment } from "@/server/services/payments";
import { rescheduleReservation } from "@/server/services/reschedule";
import { createStaffReservation } from "@/server/services/staff-booking";
import { SITE } from "@/config/site";
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

/**
 * A table may just have become free: guests waiting for that evening are told.
 * A failure here must never undo the change that freed the table.
 */
async function tellWaitingGuests(): Promise<void> {
  try {
    await notifyWaitingList(db);
  } catch (error) {
    console.error("Waiting list could not be notified", error);
  }
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
  target.searchParams.delete("refunded");
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
    await tellWaitingGuests();
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
    await tellWaitingGuests();
  });
}

export async function completeWalkInAction(walkInId: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, () => completeWalkIn(db, walkInId));
}

const WALK_IN_EXTENSION_MINUTES = 30;

/** Moves a walk-in party after staff confirmed it. `tableIds` is comma-separated. */
export async function moveWalkInAction(walkInId: string, tableIds: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, (staffId) => moveWalkIn(db, walkInId, tableIds.split(","), staffId));
}

export async function extendWalkInAction(walkInId: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, (staffId) => extendWalkIn(db, walkInId, WALK_IN_EXTENSION_MINUTES, staffId));
}

const blockSchema = z.object({
  /** "now", or "later" with a date and a start time. */
  when: z.enum(["now", "later"]).default("later"),
  /** "close": until the end of that evening's service; "hours": for `minutes`. */
  until: z.enum(["close", "hours"]).default("hours"),
  minutes: z.coerce.number().int().min(15).max(24 * 60).optional(),
  reason: z.string().max(200).optional(),
  /** YYYY-MM-DD and HH:mm in the restaurant's timezone; both empty means "from now" (see blockStart). */
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
    const now = new Date();
    const from = input.when === "now" ? now : blockStart(input, settings, now);
    let until: Date;
    if (input.until === "close") {
      // The end of the evening the block starts in: closing time, the next day when it is after midnight.
      const day = zonedDate(addMinutes(from, -6 * 60), settings.timezone);
      until = zonedToInstant(day, SITE.closes, settings.timezone);
      while (until.getTime() <= from.getTime()) until = addMinutes(until, 24 * 60);
    } else {
      if (!input.minutes) throw new BookingError("INVALID_SELECTION");
      until = addMinutes(from, input.minutes);
    }
    await blockTables(db, { tableIds: [tableId], from, until, reason: input.reason }, staffId);
  });
}

export async function unblockAction(allocationId: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, (staffId) => releaseBlock(db, allocationId, staffId));
}

/** Moves a reservation after staff confirmed the preview. `tableIds` is comma-separated. */
export async function moveAction(reservationId: string, tableIds: string, returnTo: string): Promise<void> {
  await floorAction(returnTo, (staffId) => moveReservation(db, reservationId, tableIds.split(","), staffId));
}

/** Runs a change made from a window on the reservations list and says on the page that it was done. */
async function listAction(returnTo: string, run: (staffId: string) => Promise<unknown>): Promise<void> {
  const target = new URL(returnTo.startsWith("/manage") ? returnTo : "/manage/reservations", "http://local");
  let failure: string | null = null;
  try {
    const staff = await requirePermission("operations");
    await run(staff.id);
  } catch (error) {
    failure = errorCode(error);
  }
  target.searchParams.delete("refunded");
  target.searchParams.delete("error");
  target.searchParams.delete("done");
  if (failure) target.searchParams.set("error", failure);
  else target.searchParams.set("done", "1");
  revalidatePath("/manage", "layout");
  redirect(target.pathname + target.search);
}

/** Changes a reservation's table from the reservations list. The price paid stays as it is. */
export async function moveFromListAction(reservationId: string, returnTo: string, form: FormData): Promise<void> {
  await listAction(returnTo, async (staffId) => {
    const to = String(form.get("to") ?? "");
    if (!/^[0-9a-f-]{36}(,[0-9a-f-]{36})*$/.test(to)) throw new BookingError("INVALID_SELECTION");
    await moveReservation(db, reservationId, to.split(","), staffId);
  });
}

const changeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  guests: z.coerce.number().int().min(1).max(100),
  tableId: z.union([z.literal(""), z.string().uuid()]),
});

/**
 * Staff change a reservation's date, time, number of guests or table for the
 * guest. Not bound by the guest's limits, and nothing is charged or refunded.
 * The guest gets the email with the new details.
 */
export async function changeReservationAction(reservationId: string, returnTo: string, form: FormData): Promise<void> {
  await listAction(returnTo, async (staffId) => {
    const parsed = changeSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new BookingError("INVALID_SELECTION");
    const { date, time, guests, tableId } = parsed.data;
    await rescheduleReservation(
      db,
      reservationId,
      { date, time, selection: tableId ? { mode: "TABLE", tableId } : { mode: "AUTO" } },
      staffId,
      new Date(),
      { partySize: guests },
    );
    await notifyReservationEvent(db, reservationId, "CHANGED_BY_STAFF");
    await tellWaitingGuests();
  });
}

const noteSchema = z.object({ note: z.string().max(1000) });

/** The restaurant's own note on one reservation. */
export async function saveReservationNoteAction(reservationId: string, returnTo: string, form: FormData): Promise<void> {
  await listAction(returnTo, async (staffId) => {
    const parsed = noteSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new BookingError("INVALID_SELECTION");
    await saveReservationNote(db, reservationId, parsed.data.note, staffId);
  });
}

/** The standing note about a guest, shown on every reservation of theirs. */
export async function saveGuestNoteAction(customerId: string, returnTo: string, form: FormData): Promise<void> {
  await listAction(returnTo, async (staffId) => {
    const parsed = noteSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new BookingError("INVALID_SELECTION");
    await saveGuestNote(db, customerId, parsed.data.note, staffId);
  });
}

export async function removeWaitingAction(entryId: string, returnTo: string): Promise<void> {
  await listAction(returnTo, (staffId) => removeWaiting(db, entryId, staffId));
}

/** Staff email one waiting guest that a table is free, whatever their place in the list. */
export async function notifyWaitingAction(entryId: string, returnTo: string): Promise<void> {
  await listAction(returnTo, (staffId) => notifyWaitingEntry(db, entryId, staffId));
}

const staffReservationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.literal(""), z.string().trim().email().max(200)]).optional(),
  guests: z.coerce.number().int().min(1).max(60),
  locale: z.enum(["el", "en"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  tableIds: z.string().regex(/^([0-9a-f-]{36}(,[0-9a-f-]{36})*)?$/),
  notes: z.string().trim().max(500).optional(),
  occasion: z.union([z.literal(""), z.enum(OCCASIONS)]).optional(),
});

/** A reservation taken by hand: no deposit; the guest is emailed only if an address was given. */
export async function newReservationAction(returnTo: string, form: FormData): Promise<void> {
  const target = new URL(returnTo.startsWith("/manage") ? returnTo : "/manage/reservations", "http://local");
  for (const key of ["error", "done", "created", "refunded"]) target.searchParams.delete(key);
  try {
    const staff = await requirePermission("operations");
    const parsed = staffReservationSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new BookingError("INVALID_SELECTION");
    const input = parsed.data;
    const created = await createStaffReservation(
      db,
      {
        date: input.date,
        time: input.time,
        partySize: input.guests,
        name: input.name,
        phone: input.phone,
        email: input.email || undefined,
        notes: input.notes,
        occasion: input.occasion || undefined,
        locale: input.locale,
        tableIds: input.tableIds ? input.tableIds.split(",") : [],
      },
      staff.id,
    );
    if (input.email) await notifyReservationEvent(db, created.reservationId, "CREATED_BY_STAFF");
    target.searchParams.set("created", created.reference);
  } catch (error) {
    target.searchParams.set("error", errorCode(error));
  }
  revalidatePath("/manage", "layout");
  redirect(target.pathname + target.search);
}

const refundSchema = z.object({ amount: z.coerce.number().positive().max(100_000), reason: z.string().trim().min(3).max(300) });

/** A manager's refund outside the cancellation policy. Needs the "refunds" permission and a reason. */
export async function refundAction(reservationId: string, returnTo: string, formData: FormData): Promise<void> {
  const target = new URL(returnTo.startsWith("/manage") ? returnTo : "/manage", "http://local");
  let failure: string | null = null;
  let refundedCents = 0;
  try {
    const staff = await requirePermission("refunds");
    const parsed = refundSchema.safeParse(Object.fromEntries(formData));
    const gateway = stripeGateway();
    if (!parsed.success || !gateway) throw new BookingError("INVALID_SELECTION");
    const result = await discretionaryRefund(
      db,
      gateway,
      reservationId,
      { amountCents: Math.round(parsed.data.amount * 100), reason: parsed.data.reason },
      staff.id,
    );
    refundedCents = result.refundedCents;
  } catch (error) {
    failure = errorCode(error);
  }
  if (failure) target.searchParams.set("error", failure === "INVALID_SELECTION" ? "REFUND_FAILED" : failure);
  else target.searchParams.delete("error");
  // Shown back to the manager as proof that the refund went through.
  if (failure) target.searchParams.delete("refunded");
  else target.searchParams.set("refunded", String(refundedCents));
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
