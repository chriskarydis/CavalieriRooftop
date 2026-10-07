"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { DateField } from "../DateField";
import { inputClass, primaryButton, secondaryButton } from "../styles";

export interface SeatingChoice {
  /** Table ids, comma-separated for joined tables. */
  value: string;
  label: string;
}

/** A button that opens a small window over the page, for a change made on the spot. */
export function Window({
  button,
  title,
  closeLabel,
  children,
  buttonClassName = secondaryButton,
  wide = false,
}: {
  button: string;
  title: string;
  closeLabel: string;
  children: ReactNode;
  buttonClassName?: string;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // The form is only in the page while its window is open: a list has one window per row.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName}>
        {button}
      </button>
      {open && (
        <dialog
          ref={dialog}
          onClose={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
          className={`m-auto ${wide ? "w-[min(36rem,calc(100vw-2rem))]" : "w-[min(28rem,calc(100vw-2rem))]"} max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-line bg-white p-0 text-left text-sm text-slate-900 shadow-xl backdrop:bg-night/60`}
        >
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base">{title}</h2>
              <button type="button" aria-label={closeLabel} title={closeLabel} onClick={() => dialog.current?.close()} className="-mt-1 text-xl leading-none text-slate-500 hover:text-slate-900">
                <span aria-hidden>×</span>
              </button>
            </div>
            {children}
          </div>
        </dialog>
      )}
    </>
  );
}

/** "The reservation is at table 1. Where should it go?" Changes the table and nothing else. */
export function MoveTableDialog({
  action,
  seatings,
  labels,
}: {
  action: (form: FormData) => Promise<void>;
  seatings: SeatingChoice[];
  labels: { button: string; title: string; now: string; to: string; note: string; confirm: string; close: string };
}) {
  return (
    <Window button={labels.button} title={labels.title} closeLabel={labels.close}>
      <form action={action} className="space-y-4">
        <p>{labels.now}</p>
        <label className="block font-medium">
          {labels.to}
          <select name="to" required defaultValue="" className={inputClass}>
            <option value="" disabled />
            {seatings.map((seating) => (
              <option key={seating.value} value={seating.value}>
                {seating.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-600">{labels.note}</p>
        <button type="submit" className={primaryButton}>
          {labels.confirm}
        </button>
      </form>
    </Window>
  );
}

/** Staff change the date, time, number of guests or table of a reservation for the guest. */
export function ChangeReservationDialog({
  action,
  current,
  timeSlots,
  maxParty,
  tables,
  labels,
}: {
  action: (form: FormData) => Promise<void>;
  current: { date: string; time: string; guests: number; tableId: string };
  timeSlots: string[];
  maxParty: number;
  /** Single tables only; for joined tables the system chooses. */
  tables: SeatingChoice[];
  labels: {
    button: string;
    title: string;
    now: string;
    date: string;
    time: string;
    guests: string;
    table: string;
    auto: string;
    note: string;
    confirm: string;
    close: string;
  };
}) {
  return (
    <Window button={labels.button} title={labels.title} closeLabel={labels.close}>
      <form action={action} className="space-y-4">
        <p>{labels.now}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block font-medium">
            {labels.date}
            <DateField name="date" defaultValue={current.date} required className={inputClass} />
          </label>
          <label className="block font-medium">
            {labels.time}
            <select name="time" defaultValue={current.time} required className={inputClass}>
              {timeSlots.map((slot) => (
                <option key={slot}>{slot}</option>
              ))}
            </select>
          </label>
          <label className="block font-medium">
            {labels.guests}
            <input name="guests" type="number" min={1} max={maxParty} defaultValue={current.guests} required className={inputClass} />
          </label>
          <label className="block font-medium">
            {labels.table}
            <select name="tableId" defaultValue={current.tableId} className={inputClass}>
              <option value="">{labels.auto}</option>
              {tables.map((table) => (
                <option key={table.value} value={table.value}>
                  {table.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-slate-600">{labels.note}</p>
        <button type="submit" className={primaryButton}>
          {labels.confirm}
        </button>
      </form>
    </Window>
  );
}
