import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { zonedDate, zonedTime } from "@/domain/time";
import { formatLongDate } from "@/i18n/intl-locale";
import { Link, redirect } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { siteUrl } from "@/config/site";
import { stripeConfigured, stripeGateway } from "@/server/payments/gateway";
import { simulatedPaymentsEnabled } from "@/server/payments/mode";
import { BookingError } from "@/server/services/context";
import { getReservationByToken } from "@/server/services/guest-reservation";
import { notifyReservationEvent } from "@/server/services/notifications";
import { getPaymentSummary, preparePayment, reconcilePayment } from "@/server/services/payments";
import { simulatePayment } from "../actions";
import { PriceSummary } from "../PriceSummary";
import { AwaitConfirmation } from "./AwaitConfirmation";
import { DetailsForm } from "./DetailsForm";
import { HoldCountdown } from "./HoldCountdown";
import { StripePayment } from "./StripePayment";

// Checkout pages carry a secret token and must never be indexed or cached.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CheckoutPage({ params, searchParams }: PageProps<"/[locale]/reserve/[token]">) {
  const { locale, token } = await params;
  const returnedFromPayment = (await searchParams).redirect_status === "succeeded";
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

  // Back from the card form: ask Stripe whether the payment went through instead of waiting for its
  // webhook. The answer comes from Stripe, not from the address the browser shows.
  if (reservation.status === "PENDING_PAYMENT" && returnedFromPayment) {
    const gateway = stripeGateway();
    const outcome = gateway ? await reconcilePayment(db, gateway, reservation.id) : null;
    if (outcome?.kind === "CONFIRMED") {
      if (outcome.firstTime) await notifyReservationEvent(db, reservation.id, "CONFIRMED");
      return redirect({ href: `/reservation/${token}`, locale });
    }
    if (outcome?.kind === "REFUNDED_HOLD_EXPIRED") return redirect({ href: `/reserve/${token}`, locale });
  }

  const payment = await getPaymentSummary(db, reservation.id);

  // Paid, but the hold had lapsed and the table was gone: the payment was refunded automatically.
  if (reservation.status === "EXPIRED" && payment?.status === "REFUNDED") {
    return (
      <main className="mx-auto w-full max-w-xl space-y-5 px-4 py-12">
        <h1 className="text-3xl sm:text-4xl">{t("refundedTitle")}</h1>
        <p>{t("refundedText")}</p>
        <Link href={restart} className="btn btn-primary">
          {t("chooseAgain")}
        </Link>
      </main>
    );
  }

  // Stripe has not settled the payment yet: keep asking until it has.
  if (reservation.status === "PENDING_PAYMENT" && returnedFromPayment) {
    return (
      <main className="mx-auto w-full max-w-xl space-y-5 px-4 py-12">
        <h1 className="text-3xl sm:text-4xl">{t("title")}</h1>
        <AwaitConfirmation message={t("confirming")} />
      </main>
    );
  }

  if (!found.holdActive) {
    return (
      <main className="mx-auto w-full max-w-xl space-y-5 px-4 py-12">
        <h1 className="text-3xl sm:text-4xl">{t("expiredTitle")}</h1>
        <p>{t("expiredText")}</p>
        <Link href={restart} className="btn btn-primary">
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

  const amount = format.number(reservation.totalCents / 100, { style: "currency", currency: "EUR" });
  const gateway = stripeGateway();
  let clientSecret: string | null = null;
  if (customer && gateway && stripeConfigured()) {
    try {
      clientSecret = (await preparePayment(db, gateway, reservation.id)).clientSecret;
    } catch (error) {
      if (!(error instanceof BookingError)) throw error;
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <h1 className="text-3xl sm:text-4xl">{t("title")}</h1>
      <HoldCountdown expiresAt={reservation.holdExpiresAt!.toISOString()} restartHref={restart} />

      <section className="panel">
        <h2 className="mb-3 text-2xl">{t("summaryTitle")}</h2>
        <dl className="mb-4 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-muted">{t("date")}</dt>
          <dd>{formatLongDate(reservation.startsAt, locale, settings.timezone)}</dd>
          <dt className="text-muted">{t("time")}</dt>
          <dd>{time}</dd>
          <dt className="text-muted">{t("guests")}</dt>
          <dd>{reservation.partySize}</dd>
          <dt className="text-muted">{t("table")}</dt>
          <dd>
            {tableNumbers.join(" + ")}
            {reservation.selectionMode === "AUTO" && ` (${t("assigned")})`}
          </dd>
          {reservation.tableCategoryName && reservation.tableFeeCents > 0 && (
            <>
              <dt className="text-muted">{t("category")}</dt>
              <dd>{reservation.tableCategoryName}</dd>
            </>
          )}
        </dl>
        <PriceSummary price={price} />
      </section>

      {!customer ? (
        <section className="panel">
          <h2 className="mb-3 text-2xl">{t("detailsTitle")}</h2>
          <DetailsForm token={token} locale={locale} refundHours={settings.refundCutoffHours} graceMinutes={settings.graceMinutes} />
        </section>
      ) : (
        <section className="panel">
          <h2 className="mb-3 text-2xl">{t("paymentTitle")}</h2>
          <p className="mb-3 text-sm text-muted">
            {customer.name} · {customer.email}
          </p>
          {clientSecret ? (
            <StripePayment
              publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""}
              clientSecret={clientSecret}
              returnUrl={`${siteUrl()}/${locale}/reserve/${token}`}
              payLabel={t("pay", { amount })}
              locale={locale}
            />
          ) : simulatedPaymentsEnabled() ? (
            <form action={simulatePayment.bind(null, token, locale)}>
              <button type="submit" className="btn btn-primary w-full">
                {t("simulatePay", { amount })}
              </button>
              <p className="mt-2 text-xs text-amber-800">{t("simulateNote")}</p>
            </form>
          ) : (
            <p className="notice notice-warn">{t("paymentUnavailable")}</p>
          )}
        </section>
      )}
    </main>
  );
}
