import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { zonedTime } from "@/domain/time";
import { formatLongDate, intlLocale } from "@/i18n/intl-locale";
import { redirect } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { getReservationByToken } from "@/server/services/guest-reservation";
import { getPaymentSummary } from "@/server/services/payments";
import { Ornament } from "@/ui/PageHeader";
import { cancelByGuest } from "../../reserve/actions";
import { PriceSummary } from "../../reserve/PriceSummary";

// Manage links carry a secret token and must never be indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ManageReservationPage({ params }: PageProps<"/[locale]/reservation/[token]">) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const found = await getReservationByToken(db, token);
  if (!found) notFound();

  const { reservation, customer, tableNumbers, settings, cancellation } = found;
  if (reservation.status === "PENDING_PAYMENT" || reservation.status === "EXPIRED") {
    return redirect({ href: `/reserve/${token}`, locale });
  }

  const t = await getTranslations("reservation");
  const format = await getFormatter();
  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const canCancel = reservation.status === "CONFIRMED" || reservation.status === "LATE";
  const payment = await getPaymentSummary(db, reservation.id);

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <header className="text-center">
        <h1 className="text-3xl sm:text-4xl">{t(`status.${reservation.status}`)}</h1>
        <Ornament className="mt-5" />
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
        </dl>
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
        {payment && payment.refundedCents > 0 && (
          <p className="notice notice-ok mt-3">
            {t("refunded", { amount: euro(payment.refundedCents) })}
          </p>
        )}
      </section>

      <section className="panel text-sm">
        <h2 className="mb-3 text-2xl">{t("policyTitle")}</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("policyGrace", { minutes: settings.graceMinutes })}</li>
          <li>{t("policyRefund", { hours: settings.refundCutoffHours })}</li>
          <li>{t("policyMinimum")}</li>
        </ul>
      </section>

      {canCancel && (
        <section className="panel">
          <h2 className="mb-3 text-2xl">{t("cancelTitle")}</h2>
          <p className="mb-3 text-sm">
            {cancellation.refundable
              ? t("cancelRefund", {
                  amount: euro(cancellation.refundCents),
                  deadline: new Intl.DateTimeFormat(intlLocale(locale), {
                    dateStyle: "medium",
                    timeStyle: "short",
                    hourCycle: "h23",
                    timeZone: settings.timezone,
                  }).format(cancellation.refundDeadline),
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
