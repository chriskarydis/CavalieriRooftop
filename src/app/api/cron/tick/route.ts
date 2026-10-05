import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db/client";
import { expireHolds } from "@/server/services/booking";
import { closeOutLateReservations, flagLateReservations } from "@/server/services/floor-service";
import { notifyReservationEvent, sendDueReminders } from "@/server/services/notifications";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Runs every minute from the scheduler: frees lapsed holds, marks late
 * reservations, closes out reservations that never arrived and sends reminders.
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorised(request)) return new Response("Unauthorized", { status: 401 });
  const now = new Date();
  const [expired, late, noShow] = [
    await expireHolds(db, now),
    await flagLateReservations(db, now),
    await closeOutLateReservations(db, now),
  ];
  for (const reservationId of noShow) await notifyReservationEvent(db, reservationId, "NO_SHOW");
  const reminders = await sendDueReminders(db, now);
  return Response.json({ expired: expired.length, late: late.length, noShow: noShow.length, reminders });
}
