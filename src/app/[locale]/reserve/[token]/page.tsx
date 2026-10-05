import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { zonedDate, zonedTime } from "@/domain/time";
import { formatLongDate } from "@/i18n/intl-locale";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { simulatedPaymentsEnabled } from "@/server/payments/mode";
import { getReservationByToken } from "@/server/services/guest-reservation";
import { simulatePayment } from "../actions";
import { PriceSummary } from "../PriceSummary";
import { DetailsForm } from "./DetailsForm";
import { HoldCountdown } from "./HoldCountdown";

// Checkout pages carry a secret token and must never be indexed or cached.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: PageProps<"/[locale]/reserve/[token]">) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const found = await getReservationByToken(db, token);
  if (!found) notFound();

  const { reservation, customer, tableNumbers, settings } = found;
  if (reservation.status !== "PENDING_PAYMENT" && reservation.status !== "EXPIRED") {
    return redirect({ href: `/reservation/${token}`, locale });
  }

  const t = await getTranslations("checkout");
  const format = await getFormatter();
  const date = zonedDate(reservation.startsAt, settings.timezone);
  const time = zonedTime(reservation.startsAt, settings.timezone);
  const restart = {
    pathname: "/reserve" as const,
    query: { date, time, guests: String(reservation.partySize) },
  };

  if (!found.holdActive) {
    return (
      <main className="mx-auto w-full max-w-xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">{t("expiredTitle")}</h1>
        <p>{t("expiredText")}</p>
        <Link href={restart} className="inline-block rounded-md bg-stone-900 px-4 py-3 font-medium text-white">
          {t("chooseAgain")}
        </Link>
      </main>
    );
  }

  const price = {
    partySize: reservation.partySize,
    depositPerPersonCents: reservation.depositPerPersonCents,
    billableSeats: reservation.billableSeats,
    depositCents: reservation.depositCents,
    tableFeeCents: reservation.tableFeeCents,
    totalCents: reservation.totalCents,
    creditTowardBillCents: reservation.creditTowardBillCents,
  };

  return (
    <main className="mx-auto w-full max-w-xl space-y-5 p-4 pb-16">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <HoldCountdown expiresAt={reservation.holdExpiresAt!.toISOString()} restartHref={restart} />

      <section className="rounded-xl border border-stone-300 bg-white p-4">
        <h2 className="mb-2 font-semibold">{t("summaryTitle")}</h2>
        <dl className="mb-4 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-stone-600">{t("date")}</dt>
          <dd>{formatLongDate(reservation.startsAt, locale, settings.timezone)}</dd>
          <dt className="text-stone-600">{t("time")}</dt>
          <dd>{time}</dd>
          <dt className="text-stone-600">{t("guests")}</dt>
          <dd>{reservation.partySize}</dd>
          <dt className="text-stone-600">{t("table")}</dt>
          <dd>
            {tableNumbers.join(" + ")}
            {reservation.selectionMode === "AUTO" && ` (${t("assigned")})`}
          </dd>
          {reservation.tableCategoryName && reservation.tableFeeCents > 0 && (
            <>
              <dt className="text-stone-600">{t("category")}</dt>
              <dd>{reservation.tableCategoryName}</dd>
            </>
          )}
        </dl>
        <PriceSummary price={price} />
      </section>

      {!customer ? (
        <section className="rounded-xl border border-stone-300 bg-white p-4">
          <h2 className="mb-3 font-semibold">{t("detailsTitle")}</h2>
          <DetailsForm token={token} locale={locale} refundHours={settings.refundCutoffHours} graceMinutes={settings.graceMinutes} />
        </section>
      ) : (
        <section className="rounded-xl border border-stone-300 bg-white p-4">
          <h2 className="mb-2 font-semibold">{t("paymentTitle")}</h2>
          <p className="mb-3 text-sm text-stone-700">
            {customer.name} · {customer.email}
          </p>
          {simulatedPaymentsEnabled() ? (
            <form action={simulatePayment.bind(null, token, locale)}>
              <button type="submit" className="w-full rounded-md bg-stone-900 px-4 py-3 font-medium text-white">
                {t("simulatePay", {
                  amount: format.number(reservation.totalCents / 100, { style: "currency", currency: "EUR" }),
                })}
              </button>
              <p className="mt-2 text-xs text-amber-800">{t("simulateNote")}</p>
            </form>
          ) : (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{t("paymentUnavailable")}</p>
          )}
        </section>
      )}
    </main>
  );
}
