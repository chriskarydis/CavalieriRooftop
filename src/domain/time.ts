/**
 * Time helpers. Instants are UTC `Date`s; the restaurant reasons in its own
 * timezone ("service date" YYYY-MM-DD and "slot" HH:mm).
 */

const MINUTE_MS = 60_000;

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE_MS);
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock in `timeZone` shows `date` `time`. */
export function zonedToInstant(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone);
  // Re-evaluate at the guess so dates next to a clock change resolve correctly.
  return new Date(wallAsUtc - offsetMs(new Date(firstGuess), timeZone));
}

/** Calendar date (YYYY-MM-DD) shown in `timeZone` at `instant`. */
export function zonedDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    instant,
  );
}

/** 24-hour wall-clock time (HH:mm) shown in `timeZone` at `instant`. */
export function zonedTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    instant,
  );
}

/** ISO weekday of a calendar date: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
}

export interface OpeningSettings {
  /** MM-DD, inclusive. */
  seasonStart: string;
  seasonEnd: string;
  closedWeekdays: readonly number[];
  timeSlots: readonly string[];
}

export type ClosedReason = "OUT_OF_SEASON" | "CLOSED_WEEKDAY" | "CLOSED_DATE";

/** Null when the restaurant takes dinner reservations on `date`. */
export function closedReason(
  date: string,
  settings: OpeningSettings,
  closedDates: ReadonlySet<string>,
): ClosedReason | null {
  const monthDay = date.slice(5);
  if (monthDay < settings.seasonStart || monthDay > settings.seasonEnd) return "OUT_OF_SEASON";
  if (settings.closedWeekdays.includes(isoWeekday(date))) return "CLOSED_WEEKDAY";
  if (closedDates.has(date)) return "CLOSED_DATE";
  return null;
}

/**
 * When a block made by hand begins. With nothing filled in it begins now. A
 * date without a time begins at that evening's first time slot (it must never
 * fall back to "now": that would block the table today). A time without a date
 * means today.
 */
export function blockStart(
  input: { date?: string; start?: string },
  settings: { timezone: string; timeSlots: readonly string[] },
  now: Date,
): Date {
  if (!input.date && !input.start) return now;
  const date = input.date || zonedDate(now, settings.timezone);
  const start = input.start || settings.timeSlots[0] || "00:00";
  return zonedToInstant(date, start, settings.timezone);
}

/** Postgres tstzrange literal for the half-open interval [start, end). */
export function toRange(start: Date, end: Date): string {
  return `[${start.toISOString()},${end.toISOString()})`;
}
