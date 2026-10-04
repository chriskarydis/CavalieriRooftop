import { describe, expect, it } from "vitest";
import { cancellationOutcome, isPastGrace } from "./cancellation";
import { assertTransition, canTransition, InvalidTransitionError } from "./reservation-state";
import { closedReason, isoWeekday, toRange, zonedDate, zonedToInstant } from "./time";

const TZ = "Europe/Athens";

describe("time", () => {
  it("converts Athens summer time (UTC+3) to an instant", () => {
    expect(zonedToInstant("2027-08-12", "20:30", TZ).toISOString()).toBe("2027-08-12T17:30:00.000Z");
  });
  it("converts Athens winter time (UTC+2) to an instant", () => {
    expect(zonedToInstant("2027-01-15", "20:30", TZ).toISOString()).toBe("2027-01-15T18:30:00.000Z");
  });
  it("handles the evenings of both clock changes", () => {
    expect(zonedToInstant("2027-03-28", "20:00", TZ).toISOString()).toBe("2027-03-28T17:00:00.000Z");
    expect(zonedToInstant("2027-10-31", "20:00", TZ).toISOString()).toBe("2027-10-31T18:00:00.000Z");
  });
  it("gives the restaurant calendar date just after local midnight", () => {
    expect(zonedDate(new Date("2027-08-12T21:30:00Z"), TZ)).toBe("2027-08-13");
  });
  it("builds a half-open range", () => {
    expect(toRange(new Date("2027-08-12T17:00:00Z"), new Date("2027-08-12T19:30:00Z"))).toBe(
      "[2027-08-12T17:00:00.000Z,2027-08-12T19:30:00.000Z)",
    );
  });
});

describe("opening rules", () => {
  const settings = { seasonStart: "05-01", seasonEnd: "10-10", closedWeekdays: [1], timeSlots: [] };
  const none = new Set<string>();
  it("knows weekdays", () => {
    expect(isoWeekday("2027-08-09")).toBe(1);
    expect(isoWeekday("2027-08-15")).toBe(7);
  });
  it("is open on a summer Thursday", () => {
    expect(closedReason("2027-08-12", settings, none)).toBeNull();
  });
  it("is closed on Mondays", () => {
    expect(closedReason("2027-08-09", settings, none)).toBe("CLOSED_WEEKDAY");
  });
  it("includes the first and last day of the season and nothing beyond", () => {
    expect(closedReason("2027-05-01", settings, none)).toBeNull();
    expect(closedReason("2027-10-10", settings, none)).toBeNull();
    expect(closedReason("2027-04-30", settings, none)).toBe("OUT_OF_SEASON");
    expect(closedReason("2027-10-12", settings, none)).toBe("OUT_OF_SEASON");
  });
  it("respects one-off closures", () => {
    expect(closedReason("2027-08-12", settings, new Set(["2027-08-12"]))).toBe("CLOSED_DATE");
  });
});

describe("cancellation policy", () => {
  const startsAt = new Date("2027-08-12T17:30:00Z");
  const outcome = (now: string) =>
    cancellationOutcome({ startsAt, now: new Date(now), refundCutoffHours: 24, paidCents: 20000 });

  it("refunds deposit and table fee in full more than 24 hours ahead", () => {
    expect(outcome("2027-08-10T12:00:00Z")).toMatchObject({ refundable: true, refundCents: 20000 });
  });
  it("still refunds at exactly 24 hours", () => {
    expect(outcome("2027-08-11T17:30:00Z")).toMatchObject({ refundable: true, refundCents: 20000 });
  });
  it("refunds nothing at 23 hours 59 minutes", () => {
    expect(outcome("2027-08-11T17:31:00Z")).toMatchObject({ refundable: false, refundCents: 0 });
  });
  it("refunds nothing after the reservation time", () => {
    expect(outcome("2027-08-12T18:00:00Z").refundCents).toBe(0);
  });
});

describe("grace period", () => {
  const startsAt = new Date("2027-08-12T17:00:00Z");
  it("is not late at exactly 15 minutes", () => {
    expect(isPastGrace(startsAt, new Date("2027-08-12T17:15:00Z"), 15)).toBe(false);
  });
  it("is late one second after", () => {
    expect(isPastGrace(startsAt, new Date("2027-08-12T17:15:01Z"), 15)).toBe(true);
  });
});

describe("reservation state machine", () => {
  it("allows the normal path", () => {
    expect(canTransition("PENDING_PAYMENT", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "SEATED")).toBe(true);
    expect(canTransition("SEATED", "COMPLETED")).toBe(true);
  });
  it("lets staff reverse automatic late and no-show handling", () => {
    expect(canTransition("LATE", "SEATED")).toBe(true);
    expect(canTransition("NO_SHOW", "SEATED")).toBe(true);
  });
  it("rejects confirming an expired hold, reviving cancelled bookings and skipping steps", () => {
    expect(canTransition("EXPIRED", "CONFIRMED")).toBe(false);
    expect(canTransition("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransition("PENDING_PAYMENT", "SEATED")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
    expect(() => assertTransition("COMPLETED", "SEATED")).toThrow(InvalidTransitionError);
  });
});
