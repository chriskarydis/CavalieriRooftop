"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementLocale } from "@stripe/stripe-js";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

function PayForm({ returnUrl, payLabel }: { returnUrl: string; payLabel: string }) {
  const t = useTranslations("checkout");
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setPending(true);
    setError(null);
    // On success Stripe sends the guest to returnUrl; the reservation itself is
    // confirmed by the server when Stripe's webhook arrives.
    const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl } });
    setPending(false);
    if (result.error) {
      const safeToShow = result.error.type === "card_error" || result.error.type === "validation_error";
      setError(safeToShow && result.error.message ? result.error.message : t("paymentFailed"));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || pending}
        className="btn btn-primary w-full"
      >
        {pending ? t("paying") : payLabel}
      </button>
      <p className="text-xs text-muted">{t("paymentSecure")}</p>
    </form>
  );
}

/** Card form served by Stripe; card details go straight to Stripe and never touch this site's server. */
export function StripePayment({
  publishableKey,
  clientSecret,
  returnUrl,
  payLabel,
  locale,
}: {
  publishableKey: string;
  clientSecret: string;
  returnUrl: string;
  payLabel: string;
  locale: string;
}) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, locale: locale as StripeElementLocale }}>
      <PayForm returnUrl={returnUrl} payLabel={payLabel} />
    </Elements>
  );
}
