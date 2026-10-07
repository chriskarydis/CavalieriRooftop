"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { intlLocale } from "@/i18n/intl-locale";

const toDisplay = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "");

/** "12/08/2027", "12-8-27", "12.08.2027" or "2027-08-12" as YYYY-MM-DD; empty when it is not a real date. */
function toIso(text: string): string {
  const typed = text.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(typed);
  const local = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(typed);
  const parts = iso ? [iso[1], iso[2], iso[3]] : local ? [local[3].length === 2 ? `20${local[3]}` : local[3], local[2], local[1]] : null;
  if (!parts) return "";
  const [year, month, day] = parts.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
}

const pad = (value: number): string => String(value).padStart(2, "0");
/** Today in the browser's own calendar, as YYYY-MM-DD. */
const todayIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/**
 * A month on one page, Monday first, in the language of the management pages.
 * Picking a day closes it.
 */
function Calendar({
  value,
  onPick,
  onClose,
}: {
  value: string;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("config");
  const locale = intlLocale(useLocale());
  const today = todayIso();
  const start = value || today;
  const [month, setMonth] = useState({ year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) - 1 });

  const first = new Date(Date.UTC(month.year, month.month, 1));
  const days = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const blanks = (first.getUTCDay() + 6) % 7;
  const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const full = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  // 1 January 2024 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, index) => weekday.format(new Date(Date.UTC(2024, 0, index + 1, 12))));
  const shift = (by: number) => {
    const index = month.year * 12 + month.month + by;
    setMonth({ year: Math.floor(index / 12), month: index % 12 });
  };
  const arrow = "flex size-9 items-center justify-center rounded-full text-lg text-slate-700 hover:bg-stone-100";

  return (
    <div
      role="dialog"
      aria-label={t("pickDate")}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="absolute top-full left-0 z-30 mt-2 w-[19.5rem] rounded-lg border border-line bg-white p-4 shadow-xl"
    >
      <div className="flex items-center justify-between">
        <button type="button" aria-label={t("previousMonth")} onClick={() => shift(-1)} className={arrow}>
          <span aria-hidden>‹</span>
        </button>
        <p aria-live="polite" className="font-display text-xl capitalize">
          {title}
        </p>
        <button type="button" aria-label={t("nextMonth")} onClick={() => shift(1)} className={arrow}>
          <span aria-hidden>›</span>
        </button>
      </div>
      <div aria-hidden className="mt-3 grid grid-cols-7 text-center text-[0.65rem] font-medium tracking-wider text-slate-500 uppercase">
        {weekdays.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {Array.from({ length: blanks }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {Array.from({ length: days }, (_, index) => {
          const iso = `${month.year}-${pad(month.month + 1)}-${pad(index + 1)}`;
          const selected = iso === value;
          return (
            <button
              key={iso}
              type="button"
              aria-pressed={selected}
              aria-label={full.format(new Date(`${iso}T12:00:00Z`))}
              onClick={() => onPick(iso)}
              className={`mx-auto flex size-9 items-center justify-center rounded-full text-sm tabular-nums ${
                selected ? "bg-ink font-medium text-white" : `hover:bg-stone-100 ${iso === today ? "font-semibold text-gold-deep ring-1 ring-gold" : ""}`
              }`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm">
        <button type="button" onClick={() => onPick(today)} className="font-medium text-gold-deep hover:underline">
          {t("today")}
        </button>
        <button type="button" onClick={onClose} className="text-slate-600 hover:underline">
          {t("closeCalendar")}
        </button>
      </div>
    </div>
  );
}

/**
 * A date written dd/mm/yyyy whatever the browser's language (a plain date
 * field follows the browser, which shows mm/dd/yyyy on many machines). The
 * form receives YYYY-MM-DD under `name`. The button, or a click in the field,
 * opens a month calendar to pick from.
 */
export function DateField({
  name,
  defaultValue = "",
  required = false,
  className,
  onChange,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  /** Called with YYYY-MM-DD whenever a whole, real date has been picked or typed. */
  onChange?: (iso: string) => void;
}) {
  const t = useTranslations("config");
  const [text, setText] = useState(toDisplay(defaultValue));
  const [iso, setIso] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  // A click anywhere else closes the calendar.
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const type = (input: HTMLInputElement) => {
    const value = toIso(input.value);
    setText(input.value);
    setIso(value);
    // Stops the form being sent with a date that cannot be read.
    input.setCustomValidity(value || (!required && input.value.trim() === "") ? "" : "dd/mm/yyyy");
    // Only once the year is typed in full: "12/08/20" on its way to "12/08/2027" is not meant as 2020.
    if (value && /\d{4}/.test(input.value)) onChange?.(value);
  };
  const pick = (value: string) => {
    setIso(value);
    setText(toDisplay(value));
    setOpen(false);
    onChange?.(value);
  };

  return (
    <span ref={box} className="relative block">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        required={required}
        value={text}
        onChange={(event) => type(event.currentTarget)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        onBlur={() => iso && setText(toDisplay(iso))}
        className={`${className ?? ""} pr-10 tabular-nums`}
      />
      <input type="hidden" name={name} value={iso} />
      <button
        type="button"
        aria-label={t("pickDate")}
        aria-expanded={open}
        title={t("pickDate")}
        onClick={() => setOpen(!open)}
        className="absolute right-1.5 bottom-1 flex size-8 items-center justify-center rounded text-slate-600 hover:bg-stone-100 hover:text-slate-900"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-[1.1rem]" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </button>
      {open && <Calendar value={iso} onPick={pick} onClose={() => setOpen(false)} />}
    </span>
  );
}
