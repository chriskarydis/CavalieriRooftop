import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/config/initial-floor";
import { price, PricingError, smallestSuitableCapacity, type PriceBreakdown } from "./pricing";
import { initialFixture } from "./testing/fixture";
import type { SelectionMode } from "./types";

const fixture = initialFixture();
const settings = {
  depositPerPersonCents: DEFAULT_SETTINGS.depositPerPersonCents,
  minBillableGuests: DEFAULT_SETTINGS.minBillableGuests,
};

function priceTable(partySize: number, tableNumber: number, selectionMode: SelectionMode = "CHOSEN"): PriceBreakdown {
  return price({
    partySize,
    selectionMode,
    seating: { kind: "TABLE", table: fixture.table(tableNumber) },
    smallestSuitableCapacity: smallestSuitableCapacity(partySize, fixture.tables),
    settings,
  });
}

function priceCombination(partySize: number, capacity: number): PriceBreakdown {
  return price({
    partySize,
    selectionMode: "CHOSEN",
    seating: { kind: "COMBINATION", capacity },
    smallestSuitableCapacity: smallestSuitableCapacity(partySize, fixture.tables),
    settings,
  });
}

describe("smallestSuitableCapacity", () => {
  it("ignores table 29, which is not a regular dinner table, so a party of 3 needs a 4-seat table", () => {
    expect(smallestSuitableCapacity(3, fixture.tables)).toBe(4);
  });
  it("counts extra-chair tables for a party of 5", () => {
    expect(smallestSuitableCapacity(5, fixture.tables)).toBe(4);
  });
  it("returns null when no single table fits", () => {
    expect(smallestSuitableCapacity(7, fixture.tables)).toBeNull();
  });
});

describe("price: guest chooses a single table", () => {
  it("2 guests at a standard 2-seat table pay 60", () => {
    const result = priceTable(2, 19);
    expect(result).toMatchObject({
      billableSeats: 2, billableBasis: "PARTY_SIZE", depositCents: 6000,
      tableFeeCents: 0, totalCents: 6000, creditTowardBillCents: 6000,
    });
  });

  it("2 guests choosing a standard 4-seat table pay for 4 seats", () => {
    const result = priceTable(2, 13);
    expect(result).toMatchObject({ billableSeats: 4, billableBasis: "TABLE_CAPACITY", totalCents: 12000 });
  });

  it("2 guests choosing a 5-seat table pay for 5 seats", () => {
    expect(priceTable(2, 23)).toMatchObject({ billableSeats: 5, depositCents: 15000, totalCents: 15000 });
  });

  it("2 guests at table 18 (4 seats, 5 with extra chair) pay for 4 seats", () => {
    expect(priceTable(2, 18)).toMatchObject({ billableSeats: 4, depositCents: 12000 });
  });

  it("3 guests at a 4-seat table pay for 3", () => {
    expect(priceTable(3, 13)).toMatchObject({ billableSeats: 3, billableBasis: "PARTY_SIZE", totalCents: 9000 });
  });

  it("3 guests choosing table 29 (3 seats) pay for 3", () => {
    expect(priceTable(3, 29)).toMatchObject({ billableSeats: 3, totalCents: 9000 });
  });

  it("2 guests choosing table 29 pay for 3 seats", () => {
    expect(priceTable(2, 29)).toMatchObject({ billableSeats: 3, billableBasis: "TABLE_CAPACITY", totalCents: 9000 });
  });

  it("5 guests at table 18 with the extra chair pay 150", () => {
    expect(priceTable(5, 18)).toMatchObject({ billableSeats: 5, totalCents: 15000 });
  });

  it("premium table: fee is added and is not credited toward the bill", () => {
    const result = priceTable(2, 1);
    expect(result).toMatchObject({
      depositCents: 12000, tableFeeCents: 5000, totalCents: 17000,
      creditTowardBillCents: 12000, tableCategoryName: "Premium",
    });
  });

  it("preferred table: 4 guests pay 120 + 20", () => {
    expect(priceTable(4, 6)).toMatchObject({ depositCents: 12000, tableFeeCents: 2000, totalCents: 14000 });
  });

  it("best-for-two table: 2 guests pay 60 + 10", () => {
    expect(priceTable(2, 70)).toMatchObject({ depositCents: 6000, tableFeeCents: 1000, totalCents: 7000 });
  });

  it("solo diner pays for two", () => {
    expect(priceTable(1, 19)).toMatchObject({ billableSeats: 2, billableBasis: "MINIMUM_GUESTS", totalCents: 6000 });
  });

  it("credits the fee when the category is configured that way", () => {
    const table = { ...fixture.table(1), feeCountsTowardMinSpend: true };
    const result = price({
      partySize: 4, selectionMode: "CHOSEN", seating: { kind: "TABLE", table },
      smallestSuitableCapacity: 4, settings,
    });
    expect(result.creditTowardBillCents).toBe(17000);
  });
});

describe("price: automatic assignment", () => {
  it("charges by party size and no fee even on a larger premium table", () => {
    expect(priceTable(2, 1, "AUTO")).toMatchObject({
      billableSeats: 2, depositCents: 6000, tableFeeCents: 0, totalCents: 6000,
    });
  });
  it("solo diner still pays for two", () => {
    expect(priceTable(1, 19, "AUTO").totalCents).toBe(6000);
  });
});

describe("price: combinations", () => {
  it("6 guests on 18+33 pay 180 with no table fee", () => {
    expect(priceCombination(6, 7)).toMatchObject({
      billableSeats: 6, depositCents: 18000, tableFeeCents: 0, totalCents: 18000, tableCategoryName: null,
    });
  });
  it("12 guests on a three-table combination pay 360", () => {
    expect(priceCombination(12, 12).totalCents).toBe(36000);
  });
  it("16 guests across two groups pay 480", () => {
    expect(priceCombination(16, 16).totalCents).toBe(48000);
  });
});

describe("price: validation", () => {
  it("rejects a party larger than the table can seat", () => {
    expect(() => priceTable(6, 18)).toThrow(PricingError);
    expect(() => priceTable(3, 19)).toThrow(PricingError);
  });
  it("rejects a non-positive or fractional party", () => {
    expect(() => priceTable(0, 19)).toThrow(PricingError);
    expect(() => priceTable(2.5, 13)).toThrow(PricingError);
  });
});
