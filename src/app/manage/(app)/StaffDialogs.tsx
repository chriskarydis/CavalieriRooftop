"use client";

import { useState } from "react";
import { BLOCK_HOURS } from "./block-hours";
import { DateField } from "./DateField";
import { Window, type SeatingChoice } from "./reservations/ReservationDialogs";
import { inputClass, primaryButton } from "./styles";

/** Every quarter of an hour from midday to midnight, for times staff pick by hand. */
const QUARTERS = Array.from({ length: 48 }, (_, index) => {
  const minutes = 12 * 60 + index * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export interface NewReservationLabels {
  button: string;
  title: string;
  name: string;
  phone: string;
  email: string;
  emailHint: string;
  guests: string;
  date: string;
  time: string;
  table: string;
  auto: string;
  language: string;
  notes: string;
  note: string;
  confirm: string;
  close: string;
}

/** A reservation taken by hand, by phone or at the door: no deposit, an email only if an address is given. */
export function NewReservationDialog({
  action,
  date,
  tableId = "",
  seatings,
  labels,
  buttonClassName,
}: {
  action: (form: FormData) => Promise<void>;
  date: string;
  tableId?: string;
  seatings: SeatingChoice[];
  labels: NewReservationLabels;
  buttonClassName?: string;
}) {
  return (
    <Window button={labels.button} title={labels.title} closeLabel={labels.close} buttonClassName={buttonClassName} wide>
      <form action={action} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block font-medium sm:col-span-2">
            {labels.name}
            <input name="name" required minLength={2} maxLength={120} className={inputClass} />
          </label>
          <label className="block font-medium">
            {labels.phone}
            <input name="phone" type="tel" maxLength={40} className={inputClass} />
          </label>
          <label className="block font-medium">
            {labels.email}
            <input name="email" type="email" maxLength={200} className={inputClass} />
            <span className="mt-1 block text-xs font-normal text-slate-500">{labels.emailHint}</span>
          </label>
          <label className="block font-medium">
            {labels.guests}
            <input name="guests" type="number" min={1} max={60} defaultValue={2} required className={inputClass} />
          </label>
          <label className="block font-medium">
            {labels.language}
            <select name="locale" defaultValue="el" className={inputClass}>
              <option value="el">Ελληνικά</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="block font-medium">
            {labels.date}
            <DateField name="date" defaultValue={date} required className={inputClass} />
          </label>
          <label className="block font-medium">
            {labels.time}
            <select name="time" defaultValue="20:00" required className={inputClass}>
              {QUARTERS.map((time) => (
                <option key={time}>{time}</option>
              ))}
            </select>
          </label>
          <label className="block font-medium sm:col-span-2">
            {labels.table}
            <select name="tableIds" defaultValue={tableId} className={inputClass}>
              <option value="">{labels.auto}</option>
              {seatings.map((seating) => (
                <option key={seating.value} value={seating.value}>
                  {seating.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block font-medium sm:col-span-2">
            {labels.notes}
            <textarea name="notes" rows={2} maxLength={500} className={inputClass} />
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

export interface BlockLabels {
  button: string;
  title: string;
  from: string;
  now: string;
  later: string;
  date: string;
  time: string;
  until: string;
  closing: string;
  forHours: string;
  hours: (count: number) => string;
  reason: string;
  reasonHint: string;
  confirm: string;
  close: string;
}

/** Takes a table out of use: from now or from a later time, until closing or for a few hours. */
export function BlockTableDialog({
  action,
  date,
  labels,
  buttonClassName,
}: {
  action: (form: FormData) => Promise<void>;
  date: string;
  labels: Omit<BlockLabels, "hours"> & { hours: string[] };
  buttonClassName?: string;
}) {
  const [later, setLater] = useState(false);
  const [forHours, setForHours] = useState(false);
  const choice = "flex items-center gap-2 font-normal";
  return (
    <Window button={labels.button} title={labels.title} closeLabel={labels.close} buttonClassName={buttonClassName}>
      <form action={action} className="space-y-4">
        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-medium">{labels.from}</legend>
          <label className={choice}>
            <input type="radio" name="when" value="now" checked={!later} onChange={() => setLater(false)} />
            {labels.now}
          </label>
          <label className={choice}>
            <input type="radio" name="when" value="later" checked={later} onChange={() => setLater(true)} />
            {labels.later}
          </label>
          {later && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <label className="block font-medium">
                {labels.date}
                <DateField name="date" defaultValue={date} required className={inputClass} />
              </label>
              <label className="block font-medium">
                {labels.time}
                <select name="start" defaultValue="20:00" className={inputClass}>
                  {QUARTERS.map((time) => (
                    <option key={time}>{time}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </fieldset>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 font-medium">{labels.until}</legend>
          <label className={choice}>
            <input type="radio" name="until" value="close" checked={!forHours} onChange={() => setForHours(false)} />
            {labels.closing}
          </label>
          <label className={choice}>
            <input type="radio" name="until" value="hours" checked={forHours} onChange={() => setForHours(true)} />
            {labels.forHours}
          </label>
          {forHours && (
            <select name="minutes" defaultValue={120} aria-label={labels.forHours} className={inputClass}>
              {BLOCK_HOURS.map((count, index) => (
                <option key={count} value={count * 60}>
                  {labels.hours[index]}
                </option>
              ))}
            </select>
          )}
        </fieldset>
        <label className="block font-medium">
          {labels.reason}
          <input name="reason" maxLength={200} className={inputClass} />
          <span className="mt-1 block text-xs font-normal text-slate-500">{labels.reasonHint}</span>
        </label>
        <button type="submit" className={primaryButton}>
          {labels.confirm}
        </button>
      </form>
    </Window>
  );
}
