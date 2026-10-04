import { describe, expect, it } from "vitest";
import { deriveTableState, type AllocationSnapshot } from "./table-state";

const at = (time: string): Date => new Date(`2027-08-12T${time}:00Z`);
const reservation = (from: string, to: string, reservationStatus: AllocationSnapshot["reservationStatus"]): AllocationSnapshot => ({
  kind: "RESERVATION",
  startsAt: at(from),
  endsAt: at(to),
  reservationStatus,
});

describe("deriveTableState", () => {
  it("reports disabled tables regardless of bookings", () => {
    expect(deriveTableState("OUT_OF_SERVICE", [reservation("17:00", "19:30", "SEATED")], at("17:30"))).toBe("OUT_OF_SERVICE");
    expect(deriveTableState("INACTIVE", [], at("17:30"))).toBe("INACTIVE");
  });

  it("is available with nothing booked", () => {
    expect(deriveTableState("ACTIVE", [], at("17:30"))).toBe("AVAILABLE");
  });

  it("is reserved for a later booking and arriving within 30 minutes of it", () => {
    const booking = [reservation("17:00", "19:30", "CONFIRMED")];
    expect(deriveTableState("ACTIVE", booking, at("16:00"))).toBe("RESERVED");
    expect(deriveTableState("ACTIVE", booking, at("16:30"))).toBe("ARRIVING");
    expect(deriveTableState("ACTIVE", booking, at("17:10"))).toBe("ARRIVING");
  });

  it("follows the reservation once its time has come", () => {
    expect(deriveTableState("ACTIVE", [reservation("17:00", "19:30", "LATE")], at("17:20"))).toBe("LATE");
    expect(deriveTableState("ACTIVE", [reservation("17:00", "19:30", "SEATED")], at("17:20"))).toBe("OCCUPIED");
  });

  it("shows walk-ins as occupied, blocks as blocked and unpaid holds as held", () => {
    const base = { startsAt: at("17:00"), endsAt: at("18:30") };
    expect(deriveTableState("ACTIVE", [{ ...base, kind: "WALK_IN" }], at("17:20"))).toBe("OCCUPIED");
    expect(deriveTableState("ACTIVE", [{ ...base, kind: "BLOCK" }], at("17:20"))).toBe("BLOCKED");
    expect(deriveTableState("ACTIVE", [{ ...base, kind: "HOLD" }], at("12:00"))).toBe("HELD");
  });

  it("prefers what is happening now over what comes next", () => {
    const allocations = [reservation("19:30", "22:00", "CONFIRMED"), reservation("17:00", "19:30", "SEATED")];
    expect(deriveTableState("ACTIVE", allocations, at("19:15"))).toBe("OCCUPIED");
  });
});
