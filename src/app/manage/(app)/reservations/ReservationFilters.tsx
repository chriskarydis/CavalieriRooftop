"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { DateField } from "../DateField";
import { inputClass } from "../styles";

/** How long to wait after the last key before searching. */
const TYPING_PAUSE_MS = 400;

/**
 * Filters for the reservations list. Every change shows its result at once:
 * no button to press. A search looks through every date.
 */
export function ReservationFilters({
  date,
  status,
  search,
  statuses,
  labels,
}: {
  date: string;
  status: string;
  search: string;
  statuses: Array<{ value: string; label: string }>;
  labels: { date: string; status: string; all: string; search: string; searching: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(search);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = (next: { date?: string; status?: string; q?: string }) => {
    const query = new URLSearchParams();
    query.set("date", next.date ?? date);
    const nextStatus = next.status ?? status;
    if (nextStatus) query.set("status", nextStatus);
    const nextSearch = (next.q ?? text).trim();
    if (nextSearch) query.set("q", nextSearch);
    startTransition(() => router.replace(`/manage/reservations?${query}`, { scroll: false }));
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(timer.current);
        show({});
      }}
      aria-busy={pending}
      className="flex flex-wrap items-end gap-3 text-sm font-medium"
    >
      <label className={`w-44 ${text.trim() ? "opacity-50" : ""}`}>
        {labels.date}
        <DateField name="date" defaultValue={date} required className={inputClass} onChange={(value) => show({ date: value })} />
      </label>
      <label className="w-44">
        {labels.status}
        <select name="status" value={status} onChange={(event) => show({ status: event.currentTarget.value })} className={inputClass}>
          <option value="">{labels.all}</option>
          {statuses.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-56 flex-1">
        {labels.search}
        <input
          type="search"
          name="q"
          value={text}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setText(value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => show({ q: value }), TYPING_PAUSE_MS);
          }}
          className={inputClass}
        />
      </label>
      {text.trim() && <p className="basis-full text-xs font-normal text-slate-600">{labels.searching}</p>}
    </form>
  );
}
