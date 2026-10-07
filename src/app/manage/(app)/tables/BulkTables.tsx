"use client";

import { useState } from "react";
import { DateField } from "../DateField";
import { inputClass, primaryButton, secondaryButton } from "../styles";

export interface BulkTablesLabels {
  tables: string;
  selectAll: string;
  selectNone: string;
  selected: string;
  howLong: string;
  always: string;
  days: string;
  from: string;
  to: string;
  daysHint: string;
  /** Shown instead of the hint, and asked again before closing, when reservations will be cancelled. */
  cancelWarning: string;
  cancelConfirm: string;
  reason: string;
  close: string;
  open: string;
}

/**
 * Tick tables, then close them or open them again: either until someone
 * opens them, or for certain days only, after which they are open by themselves.
 */
export function BulkTables({
  tables,
  today,
  closeAction,
  openAction,
  cancelsReservations,
  labels,
}: {
  tables: Array<{ id: string; label: string; active: boolean }>;
  /** YYYY-MM-DD in the restaurant's timezone. */
  today: string;
  closeAction: (form: FormData) => Promise<void>;
  openAction: (form: FormData) => Promise<void>;
  /** The restaurant has switched on cancelling reservations when tables are closed for days. */
  cancelsReservations: boolean;
  labels: BulkTablesLabels;
}) {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [forDays, setForDays] = useState(false);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (!next.delete(id)) next.add(id);
    setChosen(next);
  };
  const choice = "flex items-center gap-2 font-normal";

  return (
    <form className="space-y-4 text-sm">
      <fieldset>
        <legend className="sr-only">{labels.tables}</legend>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setChosen(new Set(tables.map((table) => table.id)))} className={secondaryButton}>
            {labels.selectAll}
          </button>
          <button type="button" onClick={() => setChosen(new Set())} disabled={chosen.size === 0} className={`${secondaryButton} disabled:opacity-50`}>
            {labels.selectNone}
          </button>
          <span aria-live="polite" className="text-slate-600">
            {labels.selected.replace("{count}", String(chosen.size))}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {tables.map((table) => (
            <label key={table.id} className={`flex items-center gap-1 ${table.active ? "" : "text-red-700"}`}>
              <input type="checkbox" name="tableIds" value={table.id} checked={chosen.has(table.id)} onChange={() => toggle(table.id)} />
              {table.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 font-medium">{labels.howLong}</legend>
        <label className={choice}>
          <input type="radio" name="mode" value="always" checked={!forDays} onChange={() => setForDays(false)} />
          {labels.always}
        </label>
        <label className={choice}>
          <input type="radio" name="mode" value="days" checked={forDays} onChange={() => setForDays(true)} />
          {labels.days}
        </label>
        {forDays && (
          <div className="space-y-2 pt-1">
            <div className="grid max-w-md grid-cols-2 gap-3">
              <label className="block font-medium">
                {labels.from}
                <DateField name="from" defaultValue={today} required className={inputClass} />
              </label>
              <label className="block font-medium">
                {labels.to}
                <DateField name="to" defaultValue={today} required className={inputClass} />
              </label>
            </div>
            {cancelsReservations ? (
              <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">{labels.cancelWarning}</p>
            ) : (
              <p className="text-xs text-slate-600">{labels.daysHint}</p>
            )}
          </div>
        )}
      </fieldset>

      <label className="block font-medium">
        {labels.reason}
        <input name="reason" maxLength={200} className={inputClass} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          formAction={closeAction}
          disabled={chosen.size === 0}
          onClick={(event) => {
            if (forDays && cancelsReservations && !window.confirm(labels.cancelConfirm)) event.preventDefault();
          }}
          className={`${primaryButton} disabled:opacity-50`}
        >
          {labels.close}
        </button>
        <button formAction={openAction} disabled={chosen.size === 0} className={`${secondaryButton} disabled:opacity-50`}>
          {labels.open}
        </button>
      </div>
    </form>
  );
}
