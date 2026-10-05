import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { zonedTime } from "@/domain/time";
import { formatLongDate, intlLocale } from "@/i18n/intl-locale";
import { redirect } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { getReservationByToken } from "@/server/services/guest-reservation";
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

  return (
    <main className="mx-auto w-full max-w-xl space-y-5 p-4 pb-16">
      <header>
        <p className="text-sm text-stone-600">{t("reference", { reference: reservation.reference })}</p>
        <h1 className="text-2xl font-semibold">{t(`status.${reservation.status}`)}</h1>
      </header>

      <section className="rounded-xl border border-stone-300 bg-white p-4">
        <dl className="mb-4 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-stone-600">{t("date")}</dt>
          <dd>{formatLongDate(reservation.startsAt, locale, settings.timezone)}</dd>
          <dt className="text-stone-600">{t("time")}</dt>
          <dd>{zonedTime(reservation.startsAt, settings.timezone)}</dd>
          <dt className="text-stone-600">{t("guests")}</dt>
          <dd>{reservation.partySize}</dd>
          <dt className="text-stone-600">{t("table")}</dt>
          <dd>{tableNumbers.join(" + ")}</dd>
          {customer && (
            <>
              <dt className="text-stone-600">{t("name")}</dt>
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
      </section>

      <section className="rounded-xl border border-stone-300 bg-white p-4 text-sm">
        <h2 className="mb-2 text-base font-semibold">{t("policyTitle")}</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("policyGrace", { minutes: settings.graceMinutes })}</li>
          <li>{t("policyRefund", { hours: settings.refundCutoffHours })}</li>
          <li>{t("policyMinimum")}</li>
        </ul>
      </section>

      {canCancel && (
        <section className="rounded-xl border border-stone-300 bg-white p-4">
          <h2 className="mb-2 font-semibold">{t("cancelTitle")}</h2>
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
            <summary className="cursor-pointer rounded-md border border-red-300 px-4 py-2 text-center font-medium text-red-800">
              {t("cancelButton")}
            </summary>
            <form action={cancelByGuest.bind(null, token, locale)} className="mt-3">
              <p className="mb-2 text-sm">{t("cancelConfirmText")}</p>
              <button type="submit" className="w-full rounded-md bg-red-700 px-4 py-3 font-medium text-white">
                {t("cancelConfirm")}
              </button>
            </form>
          </details>
        </section>
      )}
    </main>
  );
}
