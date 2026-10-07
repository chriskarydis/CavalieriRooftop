import { describe, expect, it } from "vitest";
import { googleCalendarUrl, icsFile } from "./calendar";

const ENTRY = {
  uid: "CRG-1000@cavalieriroofgarden",
  title: "Dinner at Cavalieri Roof Garden",
  description: "Reservation CRG-1000, 2 guests. View, change or cancel: https://example.test/en/reservation/abc",
  location: "Cavalieri Roof Garden, Kapodistriou 4, 49100 Corfu Town",
  startsAt: new Date("2027-08-12T17:00:00Z"),
  endsAt: new Date("2027-08-12T19:00:00Z"),
};

describe("calendar entries", () => {
  it("writes an .ics file with the times in UTC and the text escaped", () => {
    const file = icsFile(ENTRY, new Date("2027-08-01T10:00:00Z"));
    const lines = file.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("UID:CRG-1000@cavalieriroofgarden");
    expect(lines).toContain("DTSTAMP:20270801T100000Z");
    expect(lines).toContain("DTSTART:20270812T170000Z");
    expect(lines).toContain("DTEND:20270812T190000Z");
    expect(lines).toContain("LOCATION:Cavalieri Roof Garden\\, Kapodistriou 4\\, 49100 Corfu Town");
    expect(file.endsWith("END:VCALENDAR\r\n")).toBe(true);
    // Long lines are folded, and unfolding gives the text back.
    expect(lines.every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(file.replace(/\r\n /g, "")).toContain("DESCRIPTION:Reservation CRG-1000\\, 2 guests. View\\, change or cancel: https://example.test/en/reservation/abc");
  });

  it("folds Greek text without cutting a letter in half", () => {
    const file = icsFile({ ...ENTRY, description: "Κράτηση ".repeat(20) });
    expect(file.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(file.replace(/\r\n /g, "")).toContain(`DESCRIPTION:${"Κράτηση ".repeat(20)}`);
  });

  it("builds a Google Calendar link with the same times", () => {
    const url = new URL(googleCalendarUrl(ENTRY));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("dates")).toBe("20270812T170000Z/20270812T190000Z");
    expect(url.searchParams.get("text")).toBe("Dinner at Cavalieri Roof Garden");
  });
});
