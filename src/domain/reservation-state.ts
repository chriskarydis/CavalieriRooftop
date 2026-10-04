/**
 * Reservation state machine. Every status change in the system goes through
 * `assertTransition`; statuses are never written ad hoc.
 *
 *   PENDING_PAYMENT -> CONFIRMED   payment verified
 *   PENDING_PAYMENT -> EXPIRED     hold lapsed or payment failed
 *   CONFIRMED       -> SEATED      guests arrived
 *   CONFIRMED       -> LATE        grace period passed (automatic)
 *   CONFIRMED       -> CANCELLED
 *   LATE            -> SEATED      staff accept late guests (no time limit)
 *   LATE            -> NO_SHOW     staff decision, or automatic at end of the table block
 *   LATE            -> CANCELLED
 *   NO_SHOW         -> SEATED      staff override: guests turned up after all
 *   SEATED          -> COMPLETED
 */

export const RESERVATION_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "LATE",
  "SEATED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "EXPIRED",
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

const TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "EXPIRED"],
  CONFIRMED: ["SEATED", "LATE", "CANCELLED"],
  LATE: ["SEATED", "NO_SHOW", "CANCELLED"],
  NO_SHOW: ["SEATED"],
  SEATED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: ReservationStatus,
    public readonly to: ReservationStatus,
  ) {
    super(`A reservation cannot go from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
