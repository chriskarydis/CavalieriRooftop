import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { icsFile } from "@/domain/calendar";
import { routing } from "@/i18n/routing";
import { db } from "@/server/db/client";
import { calendarEntryFor, getReservationByToken } from "@/server/services/guest-reservation";

/**
 * The reservation as a calendar file, for Apple Calendar, Outlook and other
 * calendars. Opened with the secret token of the guest's link, like the
 * reservation page itself.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string; token: string }> }): Promise<Response> {
  const { locale: requested, token } = await params;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const found = await getReservationByToken(db, token);
  if (!found || (found.reservation.status !== "CONFIRMED" && found.reservation.status !== "LATE")) {
    return new Response("Not found", { status: 404 });
  }
  const t = await getTranslations({ locale, namespace: "email.calendar" });
  return new Response(icsFile(calendarEntryFor(found, locale, token, t)), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="cavalieri-${found.reservation.reference}.ics"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
