/**
 * A reservation as a calendar entry: a link that opens Google Calendar with
 * the entry filled in, and an .ics file that Apple Calendar, Outlook and most
 * other calendars open.
 */

export interface CalendarEntry {
  /** Stable id, so adding the file twice updates the entry instead of doubling it. */
  uid: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
}

/** 20270812T180000Z */
const stamp = (instant: Date): string => instant.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Text values in an .ics file: backslash, semicolon, comma and line breaks are escaped. */
const escapeText = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const MAX_LINE = 73;

/** Lines longer than 75 bytes continue on the next line after a space (RFC 5545). */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character);
    if (bytes + size > MAX_LINE) {
      parts.push(current);
      current = " ";
      bytes = 1;
    }
    current += character;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n");
}

export function icsFile(entry: CalendarEntry, now = new Date()): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cavalieri Roof Garden//Reservations//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${entry.uid}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(entry.startsAt)}`,
    `DTEND:${stamp(entry.endsAt)}`,
    `SUMMARY:${escapeText(entry.title)}`,
    `DESCRIPTION:${escapeText(entry.description)}`,
    `LOCATION:${escapeText(entry.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n")
    .concat("\r\n");
}

export function googleCalendarUrl(entry: CalendarEntry): string {
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: entry.title,
    dates: `${stamp(entry.startsAt)}/${stamp(entry.endsAt)}`,
    details: entry.description,
    location: entry.location,
  });
  return `https://calendar.google.com/calendar/render?${query}`;
}
