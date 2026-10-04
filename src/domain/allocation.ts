import type { DomainCombination, DomainPairing, DomainTable } from "./types";

/**
 * Table allocation: builds every valid seating for a party and ranks it.
 * Pure function over configuration plus the set of tables that are busy for
 * the requested window. See docs/TABLE_ALLOCATION.md.
 */

export type AllocationPurpose =
  /** "Let us choose": only auto-assignable, online-bookable tables. */
  | "ONLINE_AUTO"
  /** Guest picks on the floor plan: every online-bookable option. */
  | "ONLINE_CHOICE"
  /** Staff placing a walk-in or moving a reservation: every active table. */
  | "STAFF";

export interface AllocationRequest {
  partySize: number;
  purpose: AllocationPurpose;
  tables: readonly DomainTable[];
  combinations: readonly DomainCombination[];
  pairings: readonly DomainPairing[];
  /** Tables with an overlapping hold, reservation, walk-in or block. */
  busyTableIds: ReadonlySet<string>;
}

export type CandidateKind = "TABLE" | "COMBINATION" | "PAIRING";

export interface Candidate {
  kind: CandidateKind;
  tableIds: string[];
  /** Combination ids used (one for COMBINATION, two for PAIRING). */
  combinationIds: string[];
  capacity: number;
  emptySeats: number;
  needsExtraChair: boolean;
  /** Highest category fee among the tables used: what the restaurant gives up by assigning it. */
  opportunityCostCents: number;
  /** Active combinations that cannot be formed while this seating is in use. */
  combinationsBlocked: number;
  priority: number;
  lowestTableNumber: number;
}

export function findCandidates(request: AllocationRequest): Candidate[] {
  const { partySize, purpose, tables, combinations, pairings, busyTableIds } = request;
  const online = purpose !== "STAFF";
  const tableById = new Map(tables.map((table) => [table.id, table]));

  const isUsable = (table: DomainTable): boolean =>
    table.status === "ACTIVE" &&
    !busyTableIds.has(table.id) &&
    (!online || table.onlineBookable);

  const activeCombinations = combinations.filter((combination) => combination.active);
  const blockedBy = (tableIds: readonly string[], ownIds: readonly string[]): number =>
    activeCombinations.filter(
      (combination) =>
        !ownIds.includes(combination.id) &&
        combination.tableIds.some((id) => tableIds.includes(id)),
    ).length;

  const candidates: Candidate[] = [];

  for (const table of tables) {
    if (!isUsable(table) || table.maxCapacity < partySize) continue;
    if (purpose === "ONLINE_AUTO" && !table.autoAssignable) continue;
    candidates.push({
      kind: "TABLE",
      tableIds: [table.id],
      combinationIds: [],
      capacity: Math.max(table.capacity, partySize),
      emptySeats: Math.max(0, table.capacity - partySize),
      needsExtraChair: partySize > table.capacity,
      opportunityCostCents: table.feeCents,
      combinationsBlocked: blockedBy([table.id], []),
      priority: table.priority,
      lowestTableNumber: table.number,
    });
  }

  const membersOf = (combination: DomainCombination): DomainTable[] | null => {
    if (!combination.active || (online && !combination.onlineBookable)) return null;
    const members: DomainTable[] = [];
    for (const id of combination.tableIds) {
      const table = tableById.get(id);
      if (!table || !isUsable(table)) return null;
      members.push(table);
    }
    return members;
  };

  const fromMembers = (
    kind: CandidateKind,
    members: DomainTable[],
    combinationIds: string[],
    capacity: number,
    priority: number,
  ): Candidate => {
    const tableIds = members.map((table) => table.id);
    return {
      kind,
      tableIds,
      combinationIds,
      capacity,
      emptySeats: capacity - partySize,
      needsExtraChair: false,
      opportunityCostCents: Math.max(...members.map((table) => table.feeCents)),
      combinationsBlocked: blockedBy(tableIds, combinationIds),
      priority,
      lowestTableNumber: Math.min(...members.map((table) => table.number)),
    };
  };

  const combinationById = new Map(combinations.map((combination) => [combination.id, combination]));

  for (const combination of combinations) {
    if (partySize < combination.minParty || partySize > combination.capacity) continue;
    const members = membersOf(combination);
    if (!members) continue;
    candidates.push(
      fromMembers("COMBINATION", members, [combination.id], combination.capacity, combination.priority),
    );
  }

  for (const pairing of pairings) {
    if (!pairing.active) continue;
    const [first, second] = pairing.combinationIds.map((id) => combinationById.get(id));
    if (!first || !second) continue;
    // A pairing is only for parties that no single one of its groups can seat.
    if (partySize <= Math.max(first.capacity, second.capacity)) continue;
    if (partySize > first.capacity + second.capacity) continue;
    const firstMembers = membersOf(first);
    const secondMembers = membersOf(second);
    if (!firstMembers || !secondMembers) continue;
    if (first.tableIds.some((id) => second.tableIds.includes(id))) continue;
    candidates.push(
      fromMembers(
        "PAIRING",
        [...firstMembers, ...secondMembers],
        [first.id, second.id],
        first.capacity + second.capacity,
        Math.min(first.priority, second.priority),
      ),
    );
  }

  return candidates.sort(compareCandidates);
}

export function allocateBest(request: AllocationRequest): Candidate | null {
  return findCandidates(request)[0] ?? null;
}

/**
 * Lower sorts first. Order of criteria:
 *  1. keep fee-carrying tables for guests who pay to choose them
 *  2. fewest empty seats
 *  3. fewest physical tables
 *  4. a table that seats the party without an extra chair
 *  5. block the fewest other combinations
 *  6. manager priority (higher first)
 *  7. table number, so the result is deterministic
 */
export function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    a.opportunityCostCents - b.opportunityCostCents ||
    a.emptySeats - b.emptySeats ||
    a.tableIds.length - b.tableIds.length ||
    Number(a.needsExtraChair) - Number(b.needsExtraChair) ||
    a.combinationsBlocked - b.combinationsBlocked ||
    b.priority - a.priority ||
    a.lowestTableNumber - b.lowestTableNumber
  );
}
