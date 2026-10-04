import type { ReservationStatus } from "./reservation-state";
import type { TableStatus } from "./types";

/**
 * What a table is doing right now, for the manager's floor plan. Derived on
 * the server from the table's configuration and its allocations; never stored
 * and never set by the browser.
 */
export type LiveTableState =
  | "INACTIVE"
  | "OUT_OF_SERVICE"
  | "BLOCKED"
  | "HELD"
  | "OCCUPIED"
  | "LATE"
  | "ARRIVING"
  | "RESERVED"
  | "AVAILABLE";

export interface AllocationSnapshot {
  kind: "HOLD" | "RESERVATION" | "WALK_IN" | "BLOCK";
  startsAt: Date;
  endsAt: Date;
  reservationStatus?: ReservationStatus;
}

/** A reservation starting within this many minutes shows as ARRIVING. */
export const ARRIVING_WINDOW_MINUTES = 30;

export function deriveTableState(
  tableStatus: TableStatus,
  allocations: readonly AllocationSnapshot[],
  now: Date,
): LiveTableState {
  if (tableStatus !== "ACTIVE") return tableStatus;

  const time = now.getTime();
  const current = allocations.find(
    (allocation) => allocation.startsAt.getTime() <= time && time < allocation.endsAt.getTime(),
  );
  if (current) {
    if (current.kind === "BLOCK") return "BLOCKED";
    if (current.kind === "WALK_IN") return "OCCUPIED";
    if (current.kind === "HOLD") return "HELD";
    if (current.reservationStatus === "SEATED") return "OCCUPIED";
    if (current.reservationStatus === "LATE") return "LATE";
    return "ARRIVING";
  }

  const upcoming = allocations
    .filter((allocation) => allocation.startsAt.getTime() > time)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  if (!upcoming) return "AVAILABLE";
  if (upcoming.kind === "HOLD") return "HELD";
  if (upcoming.kind === "BLOCK") return "BLOCKED";
  const minutesAway = (upcoming.startsAt.getTime() - time) / 60_000;
  return minutesAway <= ARRIVING_WINDOW_MINUTES ? "ARRIVING" : "RESERVED";
}
