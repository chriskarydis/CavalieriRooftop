/**
 * Until Stripe keys are configured, development can stand in for the payment
 * step so the rest of the booking flow can be exercised. The stand-in is off
 * unless explicitly enabled and can never be enabled in production.
 */
export function simulatedPaymentsEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.STRIPE_SECRET_KEY) return false;
  return process.env.ALLOW_SIMULATED_PAYMENTS === "true";
}
