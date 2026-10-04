/**
 * Cancellation policy. Cancelling at least `refundCutoffHours` before the
 * reservation refunds everything paid online (deposit and table fee).
 * Later than that, nothing is refunded automatically; a manager may still
 * issue a discretionary refund, which is a separate, audited action.
 */

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export interface CancellationOutcome {
  refundable: boolean;
  refundCents: number;
  /** Last instant at which cancelling still refunds in full. */
  refundDeadline: Date;
}

export function cancellationOutcome(input: {
  startsAt: Date;
  now: Date;
  refundCutoffHours: number;
  paidCents: number;
}): CancellationOutcome {
  const refundDeadline = new Date(input.startsAt.getTime() - input.refundCutoffHours * HOUR_MS);
  const refundable = input.now.getTime() <= refundDeadline.getTime();
  return { refundable, refundCents: refundable ? input.paidCents : 0, refundDeadline };
}

/** A reservation becomes late once the grace period after its start has fully passed. */
export function isPastGrace(startsAt: Date, now: Date, graceMinutes: number): boolean {
  return now.getTime() > startsAt.getTime() + graceMinutes * MINUTE_MS;
}
