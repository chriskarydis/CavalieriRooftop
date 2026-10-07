import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db/client";
import { expireHolds } from "@/server/services/booking";
import { stripeGateway } from "@/server/payments/gateway";
import { closeOutLateReservations, flagLateReservations } from "@/server/services/floor-service";
import { cancelAbandonedPayments } from "@/server/services/payments";
import { anonymiseOldGuests } from "@/server/services/retention";
import { notifyReservationEvent, sendDueReminders, sendReviewRequests } from "@/server/services/notifications";
import { notifyWaitingList, purgeWaitingList } from "@/server/services/waiting-list";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Runs from the scheduler: frees lapsed holds, marks late reservations, closes
 * out reservations that never arrived, sends reminders and the thank-you with
 * the review links, and tells waiting guests about tables that came free.
 */
export async function GET(request: Request): Promise<Response> {
  if (!authorised(request)) return new Response("Unauthorized", { status: 401 });
  const now = new Date();
  const [expired, late, noShow] = [
    await expireHolds(db, now),
    await flagLateReservations(db, now),
    await closeOutLateReservations(db, now),
  ];
  const gateway = stripeGateway();
  if (gateway) await cancelAbandonedPayments(db, gateway, expired, now);
  for (const reservationId of noShow) await notifyReservationEvent(db, reservationId, "NO_SHOW");
  const reminders = await sendDueReminders(db, now);
  const reviews = await sendReviewRequests(db, now);
  const waitingPurged = await purgeWaitingList(db, now);
  const waitingTold = await notifyWaitingList(db, now);
  const anonymised = await anonymiseOldGuests(db, now);
  return Response.json({ expired: expired.length, late: late.length, noShow: noShow.length, reminders, reviews, waitingTold, waitingPurged, anonymised });
}
