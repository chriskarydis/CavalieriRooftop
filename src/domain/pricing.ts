import type { DomainTable, SelectionMode } from "./types";

/**
 * Central pricing engine. Every amount shown to a guest, sent to Stripe,
 * written to an email or displayed in the dashboard comes from `price()`.
 * All money is integer cents.
 *
 * Rules (see docs/BOOKING_LOGIC.md):
 *  - Deposit = billable seats x deposit per person. It is credited in full
 *    toward the final bill and is the minimum spend.
 *  - Billable seats are the party size, never fewer than `minBillableGuests`
 *    (a solo diner books a table for two).
 *  - Automatic assignment: party-based deposit, no table fee.
 *  - Guest chooses a single table: the category fee applies. If the table has
 *    more standard seats than the smallest regular table type that fits the party,
 *    the deposit is billed on the table's standard seats instead.
 *  - Combinations and multi-group seating: party-based deposit, no table fee.
 */

export interface PricingSettings {
  depositPerPersonCents: number;
  minBillableGuests: number;
}

export type Seating =
  | { kind: "TABLE"; table: DomainTable }
  | { kind: "COMBINATION"; capacity: number };

export interface PriceInput {
  partySize: number;
  selectionMode: SelectionMode;
  seating: Seating;
  /**
   * Standard seats of the smallest online-bookable table type that fits the
   * party (see `smallestSuitableCapacity`). Null when no single table fits.
   */
  smallestSuitableCapacity: number | null;
  settings: PricingSettings;
}

export type BillableBasis = "PARTY_SIZE" | "MINIMUM_GUESTS" | "TABLE_CAPACITY";

export interface PriceBreakdown {
  partySize: number;
  depositPerPersonCents: number;
  billableSeats: number;
  billableBasis: BillableBasis;
  /** Minimum spend; paid now and deducted from the final bill. */
  depositCents: number;
  /** Table selection fee; paid now. */
  tableFeeCents: number;
  tableCategoryName: string | null;
  totalCents: number;
  /** Portion of the total that is deducted from the final bill. */
  creditTowardBillCents: number;
}

export class PricingError extends Error {
  constructor(
    public readonly code: "INVALID_PARTY_SIZE" | "PARTY_EXCEEDS_CAPACITY",
    message: string,
  ) {
    super(message);
    this.name = "PricingError";
  }
}

export function smallestSuitableCapacity(
  partySize: number,
  tables: readonly DomainTable[],
): number | null {
  let smallest: number | null = null;
  for (const table of tables) {
    // Tables kept out of automatic assignment (e.g. table 29, mostly for drinks)
    // are not a regular dinner table type and do not set the baseline.
    if (table.status !== "ACTIVE" || !table.onlineBookable || !table.autoAssignable) continue;
    if (table.maxCapacity < partySize) continue;
    if (smallest === null || table.capacity < smallest) smallest = table.capacity;
  }
  return smallest;
}

export function price(input: PriceInput): PriceBreakdown {
  const { partySize, selectionMode, seating, settings } = input;
  if (!Number.isInteger(partySize) || partySize < 1) {
    throw new PricingError("INVALID_PARTY_SIZE", "Party size must be a positive integer");
  }
  const seats = seating.kind === "TABLE" ? seating.table.maxCapacity : seating.capacity;
  if (partySize > seats) {
    throw new PricingError("PARTY_EXCEEDS_CAPACITY", "Party does not fit the selected seating");
  }

  let billableSeats = Math.max(partySize, settings.minBillableGuests);
  let billableBasis: BillableBasis = billableSeats > partySize ? "MINIMUM_GUESTS" : "PARTY_SIZE";
  let tableFeeCents = 0;
  let tableCategoryName: string | null = null;
  let feeCredited = false;

  if (seating.kind === "TABLE") {
    tableCategoryName = seating.table.categoryName;
    if (selectionMode === "CHOSEN") {
      tableFeeCents = seating.table.feeCents;
      feeCredited = seating.table.feeCountsTowardMinSpend;
      const smallest = input.smallestSuitableCapacity;
      const isLargerThanNeeded = smallest !== null && seating.table.capacity > smallest;
      if (seating.table.billBySeats && isLargerThanNeeded && seating.table.capacity > billableSeats) {
        billableSeats = seating.table.capacity;
        billableBasis = "TABLE_CAPACITY";
      }
    }
  }

  const depositCents = billableSeats * settings.depositPerPersonCents;
  return {
    partySize,
    depositPerPersonCents: settings.depositPerPersonCents,
    billableSeats,
    billableBasis,
    depositCents,
    tableFeeCents,
    tableCategoryName,
    totalCents: depositCents + tableFeeCents,
    creditTowardBillCents: depositCents + (feeCredited ? tableFeeCents : 0),
  };
}
