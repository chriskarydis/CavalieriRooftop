import { CATEGORIES, COMBINATIONS, PAIRINGS, TABLES } from "@/config/initial-floor";
import type { DomainCombination, DomainPairing, DomainTable } from "../types";

/** Domain objects built from the initial configuration; ids are readable ("t18", "c18+33"). */
export function initialFixture(): {
  tables: DomainTable[];
  combinations: DomainCombination[];
  pairings: DomainPairing[];
  table: (number: number) => DomainTable;
  ids: (...numbers: number[]) => string[];
} {
  const tables: DomainTable[] = TABLES.map((table) => {
    const category = CATEGORIES.find((entry) => entry.key === table.category);
    if (!category) throw new Error(`Unknown category ${table.category}`);
    return {
      id: `t${table.number}`,
      number: table.number,
      capacity: table.capacity,
      maxCapacity: table.maxCapacity ?? table.capacity,
      status: table.status ?? "ACTIVE",
      onlineBookable: table.onlineBookable ?? true,
      autoAssignable: table.autoAssignable ?? true,
      priority: 0,
      feeCents: category.feeCents,
      categoryName: category.name.en,
      feeCountsTowardMinSpend: false,
    };
  });
  const combinations: DomainCombination[] = COMBINATIONS.map((combination) => ({
    id: `c${combination.key}`,
    name: combination.key,
    tableIds: combination.tables.map((number) => `t${number}`),
    capacity: combination.capacity,
    minParty: combination.minParty,
    active: combination.active ?? true,
    onlineBookable: combination.onlineBookable ?? true,
    priority: 0,
  }));
  const pairings: DomainPairing[] = PAIRINGS.map(([first, second]) => ({
    id: `p${first}|${second}`,
    combinationIds: [`c${first}`, `c${second}`],
    active: true,
  }));
  const table = (number: number): DomainTable => {
    const found = tables.find((entry) => entry.number === number);
    if (!found) throw new Error(`No table ${number}`);
    return found;
  };
  return { tables, combinations, pairings, table, ids: (...numbers) => numbers.map((n) => `t${n}`) };
}
