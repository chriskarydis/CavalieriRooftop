import { describe, expect, it } from "vitest";
import { blockStart } from "./time";

const settings = { timezone: "Europe/Athens", timeSlots: ["18:30", "19:00", "20:00"] };
// 15:00 in Corfu on 1 August 2027.
const NOW = new Date("2027-08-01T12:00:00Z");

describe("when a manual block starts", () => {
  it("starts now when neither date nor time is given", () => {
    expect(blockStart({}, settings, NOW)).toEqual(NOW);
    expect(blockStart({ date: "", start: "" }, settings, NOW)).toEqual(NOW);
  });

  it("starts at the given date and time, in the restaurant's timezone", () => {
    expect(blockStart({ date: "2027-08-11", start: "21:00" }, settings, NOW)).toEqual(new Date("2027-08-11T18:00:00Z"));
  });

  it("starts at opening time on a date given without a time, never now", () => {
    expect(blockStart({ date: "2027-08-11" }, settings, NOW)).toEqual(new Date("2027-08-11T15:30:00Z"));
  });

  it("means today when only a time is given", () => {
    expect(blockStart({ start: "20:00" }, settings, NOW)).toEqual(new Date("2027-08-01T17:00:00Z"));
  });
});
