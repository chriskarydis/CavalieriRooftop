import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { googleCalendarUrl } from "@/domain/calendar";
import { zonedTime } from "@/domain/time";
import { SITE } from "@/config/site";
import { formatDate, formatLongDate } from "@/i18n/intl-locale";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { calendarEntryFor, getReservationByToken } from "@/server/services/guest-reservation";
import { getPaymentSummary } from "@/server/services/payments";
import { canMove, moveDeadline } from "@/server/services/reschedule";
import { Ornament } from "@/ui/PageHeader";
import { cancelByGuest } from "../../reserve/actions";
import { PriceSummary } from "../../reserve/PriceSummary";

// Manage links carry a secret token and must never be indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ManageReservationPage({ params, searchParams }: PageProps<"/[locale]/reservation/[token]">) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const found = await getReservationByToken(db, token);
  if (!found) notFound();

  const { reservation, customer, tableNumbers, settings, cancellation } = found;
  if (reservation.status === "PENDING_PAYMENT" || reservation.status === "EXPIRED") {
    return redirect({ href: `/reserve/${token}`, locale });
  }

  const t = await getTranslations("reservation");
  const tCalendar = await getTranslations("email.calendar");
  const format = await getFormatter();
  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const canCancel = reservation.status === "CONFIRMED" || reservation.status === "LATE";
  const payment = await getPaymentSummary(db, reservation.id);
  const cancelled = reservation.status === "CANCELLED";
  const justMoved = (await searchParams).moved === "1";
  const movable = canMove(reservation, settings, new Date());
  const deadline = (instant: Date): string =>
    `${formatDate(instant, settings.timezone)} ${zonedTime(instant, settings.timezone)}`;

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <header className="text-center">
        <h1 className="text-3xl sm:text-4xl">{t(`status.${reservation.status}`)}</h1>
        <Ornament className="mt-5" />
        {justMoved && (
          <p role="status" className="notice notice-ok mt-6 text-left">
            {t("moved")}
          </p>
        )}
        <p className="eyebrow mt-6">{t("referenceLabel")}</p>
        <p className="mt-1 font-display text-3xl tracking-wide">{reservation.reference}</p>
      </header>

      <section className="panel">
        <dl className="mb-4 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted">{t("date")}</dt>
          <dd>{formatLongDate(reservation.startsAt, locale, settings.timezone)}</dd>
          <dt className="text-muted">{t("time")}</dt>
          <dd>{zonedTime(reservation.startsAt, settings.timezone)}</dd>
          <dt className="text-muted">{t("guests")}</dt>
          <dd>{reservation.partySize}</dd>
          <dt className="text-muted">{t("table")}</dt>
          <dd>{tableNumbers.join(" + ")}</dd>
          {customer && (
            <>
              <dt className="text-muted">{t("name")}</dt>
              <dd>{customer.name}</dd>
            </>
          )}
          {reservation.occasion && (
            <>
              <dt className="text-muted">{t("occasion")}</dt>
              <dd>{t(`occasions.${reservation.occasion}`)}</dd>
            </>
          )}
        </dl>
        {reservation.totalCents > 0 && (
        <PriceSummary
          price={{
            partySize: reservation.partySize,
            depositPerPersonCents: reservation.depositPerPersonCents,
            billableSeats: reservation.billableSeats,
            depositCents: reservation.depositCents,
            tableFeeCents: reservation.tableFeeCents,
            totalCents: reservation.totalCents,
            creditTowardBillCents: reservation.creditTowardBillCents,
          }}
        />
        )}
        {!cancelled && payment && payment.refundedCents > 0 && (
          <p className="notice notice-ok mt-3">
            {t("refunded", { amount: euro(payment.refundedCents) })}
          </p>
        )}
      </section>

      {canCancel && (
        <section className="panel">
          <h2 className="mb-3 text-2xl">{t("calendarTitle")}</h2>
          <p className="mb-4 text-sm">{t("calendarText")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <a href={googleCalendarUrl(calendarEntryFor(found, locale, token, tCalendar))} target="_blank" rel="noopener" className="btn btn-outline">
              {t("calendarGoogle")}
            </a>
            <a href={`/${locale}/reservation/${token}/calendar`} className="btn btn-outline">
              {t("calendarFile")}
            </a>
          </div>
        </section>
      )}

      {cancelled && (
        <section className="panel">
          <h2 className="mb-3 text-2xl">{t("cancelledTitle")}</h2>
          <p className={`notice ${payment && payment.refundedCents > 0 ? "notice-ok" : "notice-info"}`}>
            {!payment || payment.amountCents === 0
              ? t("cancelledNothingPaid")
              : payment.refundedCents >= payment.amountCents
                ? t("cancelledRefundFull", { amount: euro(payment.refundedCents) })
                : payment.refundedCents > 0
                  ? t("cancelledRefundPart", { amount: euro(payment.refundedCents), paid: euro(payment.amountCents) })
                  : t("cancelledNoRefund", { paid: euro(payment.amountCents), hours: settings.refundCutoffHours })}
          </p>
          <p className="mt-4 text-sm">
            {t("cancelledContact")}{" "}
            <a href={SITE.phoneHref} className="text-link">
              {SITE.phone}
            </a>
            {" · "}
            <a href={`mailto:${SITE.email}`} className="text-link break-words">
              {SITE.email}
            </a>
          </p>
          <Link href="/reserve" className="btn btn-primary mt-5 w-full">
            {t("bookAgain")}
          </Link>
        </section>
      )}

      {!cancelled && (
      <section className="panel text-sm">
        <h2 className="mb-3 text-2xl">{t("policyTitle")}</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("policyGrace", { minutes: settings.graceMinutes })}</li>
          <li>{t("policyRefund", { hours: settings.refundCutoffHours })}</li>
          <li>{t("policyMinimum")}</li>
        </ul>
      </section>
      )}

      {movable && (
        <section className="panel">
          <h2 className="mb-3 text-2xl">{t("moveTitle")}</h2>
          <p className="mb-4 text-sm">{t("moveText", { deadline: deadline(moveDeadline(reservation, settings)!) })}</p>
          <Link href={`/reservation/${token}/move`} className="btn btn-outline w-full">
            {t("moveButton")}
          </Link>
        </section>
      )}

      {canCancel && (
        <section className="panel">
          <h2 className="mb-3 text-2xl">{t("cancelTitle")}</h2>
          <p className="mb-3 text-sm">
            {reservation.totalCents === 0
              ? t("cancelFree")
              : cancellation.refundable
              ? t("cancelRefund", {
                  amount: euro(cancellation.refundCents),
                  deadline: deadline(cancellation.refundDeadline),
                })
              : t("cancelNoRefund", { hours: settings.refundCutoffHours })}
          </p>
          <details>
            <summary className="btn cursor-pointer border border-red-800 text-red-800 hover:bg-red-50">
              {t("cancelButton")}
            </summary>
            <form action={cancelByGuest.bind(null, token, locale)} className="mt-3">
              <p className="mb-2 text-sm">{t("cancelConfirmText")}</p>
              <button type="submit" className="btn btn-danger w-full">
                {t("cancelConfirm")}
              </button>
            </form>
          </details>
        </section>
      )}
    </main>
  );
}
