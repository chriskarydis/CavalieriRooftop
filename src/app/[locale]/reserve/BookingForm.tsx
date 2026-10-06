"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { closedReason, type OpeningSettings } from "@/domain/time";
import { intlLocale } from "@/i18n/intl-locale";
import { useRouter } from "@/i18n/navigation";
import { RESULTS_ID } from "./results";

interface Month {
  year: number;
  /** 0 = January. */
  month: number;
}

const pad = (value: number): string => String(value).padStart(2, "0");
const isoDate = ({ year, month }: Month, day: number): string => `${year}-${pad(month + 1)}-${pad(day)}`;
const monthOf = (date: string): Month => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 });
const shift = ({ year, month }: Month, by: number): Month => {
  const index = year * 12 + month + by;
  return { year: Math.floor(index / 12), month: index % 12 };
};
const daysIn = ({ year, month }: Month): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
/** Empty cells before the 1st, in a week that starts on Monday. */
const leadingBlanks = ({ year, month }: Month): number => (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;

/** How far ahead to look for the next month with an open evening (the winter break is about half a year). */
const SEARCH_MONTHS = 12;
const DEFAULT_TIME = "20:00";

/**
 * Step 1 of booking: date, time and party size. Evenings the restaurant is
 * closed cannot be picked, but the server checks again in any case.
 */
export function BookingForm({
  locale,
  today,
  opening,
  closedDates,
  timeSlots,
  minParty,
  maxParty,
  initial,
  path = "/reserve",
  fixedGuests = false,
  openOn,
}: {
  locale: string;
  /** Today's date at the restaurant, as YYYY-MM-DD. */
  today: string;
  opening: Pick<OpeningSettings, "seasonStart" | "seasonEnd" | "closedWeekdays">;
  closedDates: string[];
  timeSlots: string[];
  minParty: number;
  maxParty: number;
  initial: { date?: string; time?: string; guests: number };
  /** Where the search goes; the booking page unless the form is reused elsewhere. */
  path?: string;
  /** The party size cannot be changed (moving an existing reservation). */
  fixedGuests?: boolean;
  /** A date whose month the calendar shows first when none is chosen yet. */
  openOn?: string;
}) {
  const t = useTranslations("reserve");
  const router = useRouter();
  const [searching, startSearch] = useTransition();
  const closed = new Set(closedDates);
  const isOpen = (date: string): boolean => date >= today && closedReason(date, { ...opening, timeSlots }, closed) === null;
  const hasOpenDay = (month: Month): boolean =>
    Array.from({ length: daysIn(month) }, (_, index) => isoDate(month, index + 1)).some(isOpen);
  /** The nearest month with an open evening in the given direction, or null. */
  const seek = (from: Month, direction: 1 | -1): Month | null => {
    for (let step = 1; step <= SEARCH_MONTHS; step += 1) {
      const candidate = shift(from, direction * step);
      if (direction === -1 && isoDate(candidate, daysIn(candidate)) < today) return null;
      if (hasOpenDay(candidate)) return candidate;
    }
    return null;
  };

  const [date, setDate] = useState(initial.date && isOpen(initial.date) ? initial.date : "");
  const [month, setMonth] = useState<Month>(() => {
    if (date) return monthOf(date);
    if (openOn && hasOpenDay(monthOf(openOn))) return monthOf(openOn);
    const current = monthOf(today);
    return hasOpenDay(current) ? current : (seek(current, 1) ?? current);
  });

  const format = intlLocale(locale);
  const monthTitle = new Intl.DateTimeFormat(format, { month: "long", year: "numeric", timeZone: "UTC" });
  const fullDate = new Intl.DateTimeFormat(format, { dateStyle: "full", timeZone: "UTC" });
  const weekdayShort = new Intl.DateTimeFormat(format, { weekday: "short", timeZone: "UTC" });
  const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
  // 1 January 2024 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, index) => weekdayShort.format(new Date(Date.UTC(2024, 0, index + 1, 12))));

  const previous = seek(month, -1);
  const next = seek(month, 1);
  const time = initial.time && timeSlots.includes(initial.time) ? initial.time : timeSlots.includes(DEFAULT_TIME) ? DEFAULT_TIME : timeSlots[0];
  const arrow = "flex size-10 items-center justify-center border border-line text-lg hover:border-ink disabled:opacity-30 disabled:hover:border-line";
  const option =
    "flex h-11 cursor-pointer items-center justify-center border border-line bg-paper text-sm tabular-nums hover:border-ink peer-checked:border-ink peer-checked:bg-ink peer-checked:text-ivory peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-deep";

  return (
    <form
      method="get"
      // Searches in place so the page does not jump back to the top; without scripts it still works as a plain form.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const query = { date, time: String(data.get("time") ?? ""), guests: String(data.get("guests") ?? "") };
        const unchanged = query.date === initial.date && query.time === initial.time && query.guests === String(initial.guests);
        if (unchanged) {
          document.getElementById(RESULTS_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        startSearch(() => router.push(`${path}?${new URLSearchParams(query)}`, { scroll: false }));
      }}
      className="panel grid gap-x-12 gap-y-8 md:grid-cols-[minmax(0,22rem)_1fr]">
      <input type="hidden" name="date" value={date} />

      <fieldset>
        <legend className="eyebrow">{t("date")}</legend>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" aria-label={t("previousMonth")} disabled={!previous} onClick={() => previous && setMonth(previous)} className={arrow}>
            <span aria-hidden>‹</span>
          </button>
          <p aria-live="polite" className="font-display text-2xl capitalize">
            {monthTitle.format(new Date(Date.UTC(month.year, month.month, 1, 12)))}
          </p>
          <button type="button" aria-label={t("nextMonth")} disabled={!next} onClick={() => next && setMonth(next)} className={arrow}>
            <span aria-hidden>›</span>
          </button>
        </div>
        <div aria-hidden className="mt-4 grid grid-cols-7 text-center text-[0.7rem] tracking-[0.12em] text-muted uppercase">
          {weekdays.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-y-1">
          {Array.from({ length: leadingBlanks(month) }, (_, index) => (
            <span key={`blank-${index}`} />
          ))}
          {Array.from({ length: daysIn(month) }, (_, index) => {
            const day = isoDate(month, index + 1);
            const open = isOpen(day);
            const selected = day === date;
            return (
              <button
                key={day}
                type="button"
                disabled={!open}
                aria-pressed={selected}
                aria-label={fullDate.format(at(day))}
                onClick={() => setDate(day)}
                className={`mx-auto flex size-10 items-center justify-center rounded-full text-sm tabular-nums transition-colors ${
                  selected
                    ? "bg-ink font-medium text-ivory"
                    : open
                      ? `hover:bg-line ${day === today ? "ring-1 ring-gold" : ""}`
                      : "text-stone-400 line-through decoration-stone-300"
                }`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-8">
        <fieldset>
          <legend className="eyebrow">{t("time")}</legend>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {timeSlots.map((slot) => (
              <label key={slot}>
                <input type="radio" name="time" value={slot} defaultChecked={slot === time} className="peer sr-only" />
                <span className={option}>{slot}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {fixedGuests && <input type="hidden" name="guests" value={initial.guests} />}
        <fieldset hidden={fixedGuests} disabled={fixedGuests}>
          <legend className="eyebrow">{t("guests")}</legend>
          <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-8">
            {Array.from({ length: maxParty - minParty + 1 }, (_, index) => minParty + index).map((count) => (
              <label key={count}>
                <input type="radio" name="guests" value={count} defaultChecked={count === initial.guests} className="peer sr-only" />
                <span className={option}>{count}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-auto">
          <p aria-live="polite" className="mb-3 min-h-7 font-display text-xl">
            {date ? <span className="capitalize">{fullDate.format(at(date))}</span> : <span className="text-muted">{t("chooseDate")}</span>}
          </p>
          <button type="submit" disabled={!date || searching} className="btn btn-primary w-full">
            {t("check")}
          </button>
        </div>
      </div>
    </form>
  );
}
