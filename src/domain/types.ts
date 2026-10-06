/**
 * Framework-free domain types. Nothing in src/domain may import from the
 * database layer, Next.js or React.
 */

export type TableStatus = "ACTIVE" | "INACTIVE" | "OUT_OF_SERVICE";

export interface DomainTable {
  id: string;
  number: number;
  /** Standard seats. This is what a capacity-based minimum spend is billed on. */
  capacity: number;
  /** Seats including any extra chair staff can add (>= capacity). */
  maxCapacity: number;
  status: TableStatus;
  /** May be booked through the public website. */
  onlineBookable: boolean;
  /** May be picked by automatic assignment. */
  autoAssignable: boolean;
  /**
   * When a smaller party chooses this table, its minimum spend is that of the
   * table's seats. Off for a table that is not a regular dinner table (table 29).
   */
  billBySeats: boolean;
  /** Manager-set preference; higher is assigned first. */
  priority: number;
  /** Extra fee of the table's category, in cents. */
  feeCents: number;
  categoryName: string;
  /** When true the category fee is also credited toward the final bill. */
  feeCountsTowardMinSpend: boolean;
}

export interface DomainCombination {
  id: string;
  name: string;
  tableIds: string[];
  /** Configured seats for the joined arrangement; not the sum of members. */
  capacity: number;
  minParty: number;
  active: boolean;
  onlineBookable: boolean;
  priority: number;
}

/** Two combinations that may seat one large party together. */
export interface DomainPairing {
  id: string;
  combinationIds: [string, string];
  active: boolean;
}

export type SelectionMode = "AUTO" | "CHOSEN";
