import { describe, expect, it } from "vitest";
import { COMBINATIONS, SPARE_TABLE_NUMBER } from "@/config/initial-floor";
import { allocateBest, findCandidates, type AllocationPurpose, type Candidate } from "./allocation";
import { initialFixture } from "./testing/fixture";

const fixture = initialFixture();

function candidates(partySize: number, busy: number[] = [], purpose: AllocationPurpose = "ONLINE_AUTO"): Candidate[] {
  return findCandidates({
    partySize,
    purpose,
    tables: fixture.tables,
    combinations: fixture.combinations,
    pairings: fixture.pairings,
    busyTableIds: new Set(fixture.ids(...busy)),
  });
}

const numbers = (candidate: Candidate | undefined): number[] =>
  (candidate?.tableIds ?? []).map((id) => Number(id.slice(1))).sort((a, b) => a - b);

const STANDARD_TWO_TOPS_OUTSIDE_COMBINATIONS = [19, 20, 21, 22, 25, 26, 27, 28, 30, 31, 32];

describe("automatic assignment", () => {
  it("seats 2 at a standard 2-seat table that is not part of any combination", () => {
    expect(numbers(candidates(2)[0])).toEqual([19]);
  });

  it("uses a combination member only when the free-standing 2-seat tables are taken", () => {
    expect(numbers(candidates(2, STANDARD_TWO_TOPS_OUTSIDE_COMBINATIONS)[0])).toEqual([7]);
  });

  it("prefers a standard 4-seat table over a paid 2-seat table", () => {
    const busy = [...STANDARD_TWO_TOPS_OUTSIDE_COMBINATIONS, 7, 8, 9, 33];
    expect(numbers(candidates(2, busy)[0])).toEqual([13]);
  });

  it("never auto-assigns table 29 but lets guests and staff choose it", () => {
    const includes29 = (purpose: AllocationPurpose): boolean =>
      candidates(3, [], purpose).some((candidate) => numbers(candidate).includes(29));
    expect(includes29("ONLINE_AUTO")).toBe(false);
    expect(includes29("ONLINE_CHOICE")).toBe(true);
    expect(includes29("STAFF")).toBe(true);
  });

  it("seats 3 and 4 at a standard 4-seat table", () => {
    expect(numbers(candidates(3)[0])).toEqual([13]);
    expect(numbers(candidates(4)[0])).toEqual([13]);
  });

  it("seats 5 at a real 5-seat table before using an extra chair", () => {
    expect(numbers(candidates(5)[0])).toEqual([23]);
    const withChair = candidates(5, [23, 24, 15])[0];
    expect(numbers(withChair)).toEqual([17]);
    expect(withChair?.needsExtraChair).toBe(true);
  });

  it("seats 6 at table 15", () => {
    expect(numbers(candidates(6)[0])).toEqual([15]);
  });

  it("seats 7 on a standard combination before one that uses premium tables", () => {
    expect(numbers(candidates(7)[0])).toEqual([18, 33]);
    expect(numbers(candidates(7, [18])[0])).toEqual([23, 24]);
    expect(numbers(candidates(7, [18, 23])[0])).toEqual([1, 6]);
  });

  it("seats 12 on a three-table combination, with two-group seating as the fallback", () => {
    const options = candidates(12);
    expect(options.slice(0, 2).map(numbers)).toEqual([[1, 6, 12], [5, 11, 16]]);
    expect(options.slice(2).every((candidate) => candidate.kind === "PAIRING")).toBe(true);
  });

  it("seats 16 across two configured groups", () => {
    const options = candidates(16);
    expect(options.map(numbers)).toEqual([
      [1, 2, 6, 7, 70],
      [4, 5, 9, 11, 90],
      [2, 3, 7, 8, 70, 80],
      [3, 4, 8, 9, 80, 90],
    ]);
    expect(options.every((candidate) => candidate.kind === "PAIRING")).toBe(true);
  });

  it("has no seating for 17", () => {
    expect(allocateBest({
      partySize: 17, purpose: "ONLINE_AUTO", tables: fixture.tables,
      combinations: fixture.combinations, pairings: fixture.pairings, busyTableIds: new Set(),
    })).toBeNull();
  });
});

describe("availability and status", () => {
  it("skips busy tables", () => {
    expect(numbers(candidates(2, [19])[0])).toEqual([20]);
  });

  it("drops a combination when any member is busy", () => {
    const options = candidates(12, [6]).map(numbers);
    expect(options[0]).toEqual([5, 11, 16]);
    expect(options.some((option) => option.includes(6))).toBe(false);
  });

  it("never offers an out-of-service table, alone or in a combination", () => {
    const tables = fixture.tables.map((table) =>
      table.number === 18 ? { ...table, status: "OUT_OF_SERVICE" as const } : table,
    );
    const all = findCandidates({
      partySize: 7, purpose: "STAFF", tables, combinations: fixture.combinations,
      pairings: fixture.pairings, busyTableIds: new Set(),
    });
    expect(all.some((candidate) => numbers(candidate).includes(18))).toBe(false);
  });
});

describe("configured combinations", () => {
  const active = COMBINATIONS.filter((combination) => combination.active !== false);

  it.each(active.map((combination) => [combination.key, combination] as const))(
    "%s is offered at its full capacity and not above it",
    (_key, combination) => {
      const sorted = [...combination.tables].sort((a, b) => a - b);
      const atCapacity = candidates(combination.capacity, [], "ONLINE_CHOICE").map(numbers);
      expect(atCapacity).toContainEqual(sorted);
      const above = candidates(combination.capacity + 1, [], "ONLINE_CHOICE")
        .filter((candidate) => candidate.kind === "COMBINATION")
        .map(numbers);
      expect(above).not.toContainEqual(sorted);
    },
  );

  it("17 + spare is unavailable until the spare table and combination are enabled", () => {
    const uses17AndSpare = (list: Candidate[]): boolean =>
      list.some((candidate) => numbers(candidate).join() === `17,${SPARE_TABLE_NUMBER}`);
    expect(uses17AndSpare(candidates(7, [], "STAFF"))).toBe(false);

    const tables = fixture.tables.map((table) =>
      table.number === SPARE_TABLE_NUMBER ? { ...table, status: "ACTIVE" as const } : table,
    );
    const combinations = fixture.combinations.map((combination) =>
      combination.name === "17+spare" ? { ...combination, active: true } : combination,
    );
    const enabled = findCandidates({
      partySize: 7, purpose: "STAFF", tables, combinations,
      pairings: fixture.pairings, busyTableIds: new Set(),
    });
    expect(uses17AndSpare(enabled)).toBe(true);
  });

  it("only offers arrangements that are configured", () => {
    const allowed = new Set(COMBINATIONS.map((combination) => [...combination.tables].sort((a, b) => a - b).join()));
    for (let party = 1; party <= 12; party++) {
      for (const candidate of candidates(party, [], "STAFF")) {
        if (candidate.kind === "COMBINATION") expect(allowed.has(numbers(candidate).join())).toBe(true);
      }
    }
  });
});
