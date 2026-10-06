"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

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

/**
 * A date written dd/mm/yyyy whatever the browser's language (a plain date
 * field follows the browser, which shows mm/dd/yyyy on many machines). The
 * form receives YYYY-MM-DD under `name`. The button opens the browser's own
 * calendar for those who prefer to pick.
 */
export function DateField({
  name,
  defaultValue = "",
  required = false,
  className,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  const pickLabel = useTranslations("config")("pickDate");
  const [text, setText] = useState(toDisplay(defaultValue));
  const [iso, setIso] = useState(defaultValue);
  const picker = useRef<HTMLInputElement>(null);

  const type = (input: HTMLInputElement) => {
    const value = toIso(input.value);
    setText(input.value);
    setIso(value);
    // Stops the form being sent with a date that cannot be read.
    input.setCustomValidity(value || (!required && input.value.trim() === "") ? "" : "dd/mm/yyyy");
  };

  return (
    <span className="relative block">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        required={required}
        value={text}
        onChange={(event) => type(event.currentTarget)}
        onBlur={() => iso && setText(toDisplay(iso))}
        className={`${className ?? ""} pr-9 tabular-nums`}
      />
      <input type="hidden" name={name} value={iso} />
      <button
        type="button"
        aria-label={pickLabel}
        title={pickLabel}
        onClick={() => picker.current?.showPicker?.()}
        className="absolute right-1.5 bottom-1.5 flex size-7 items-center justify-center text-slate-600 hover:text-slate-900"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </button>
      {/* The browser's calendar, opened by the button. Never shown or submitted itself. */}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={iso}
        onChange={(event) => {
          setIso(event.currentTarget.value);
          setText(toDisplay(event.currentTarget.value));
        }}
        className="pointer-events-none absolute right-1.5 bottom-0 size-px opacity-0"
      />
    </span>
  );
}
