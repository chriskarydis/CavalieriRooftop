"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { createWalkInAction, type WalkInState } from "../actions";

const INITIAL: WalkInState = { error: null, time: null, created: false };
const DEFAULT_MINUTES = 90;

export interface SeatingOption {
  /** Comma-separated table ids. */
  value: string;
  label: string;
}

export function WalkInForm({ seatings }: { seatings: SeatingOption[] }) {
  const t = useTranslations("manage");
  const [state, action, pending] = useActionState(createWalkInAction, INITIAL);
  const inputClass = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5";

  return (
    <form action={action} className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <label className="font-medium">
        {t("walkInForm.party")}
        <input name="partySize" type="number" min={1} max={16} defaultValue={2} required className={inputClass} />
      </label>
      <label className="font-medium">
        {t("walkInForm.kind")}
        <select name="kind" defaultValue="DRINKS" className={inputClass}>
          <option value="DRINKS">{t("walkInForm.DRINKS")}</option>
          <option value="FOOD">{t("walkInForm.FOOD")}</option>
        </select>
      </label>
      <label className="font-medium">
        {t("walkInForm.seating")}
        <select name="tableIds" required className={inputClass}>
          {seatings.map((seating) => (
            <option key={seating.value} value={seating.value}>
              {seating.label}
            </option>
          ))}
        </select>
      </label>
      <label className="font-medium">
        {t("walkInForm.minutes")}
        <input
          name="expectedMinutes"
          type="number"
          min={15}
          max={300}
          step={15}
          defaultValue={DEFAULT_MINUTES}
          required
          className={inputClass}
        />
      </label>
      <label className="font-medium">
        {t("walkInForm.name")}
        <input name="name" maxLength={120} className={inputClass} />
      </label>
      <label className="font-medium">
        {t("walkInForm.notes")}
        <input name="notes" maxLength={500} className={inputClass} />
      </label>
      {state.error === "UPCOMING_RESERVATION" && (
        <label className="col-span-2 flex items-start gap-2 rounded-md bg-amber-50 p-2 text-amber-900">
          <input name="overrideUpcoming" type="checkbox" className="mt-1" />
          <span>
            {t("errors.UPCOMING_RESERVATION", { time: state.time ?? "" })} {t("walkInForm.override")}
          </span>
        </label>
      )}
      {state.error && state.error !== "UPCOMING_RESERVATION" && (
        <p role="alert" className="col-span-2 text-red-700">
          {t.has(`errors.${state.error}`) ? t(`errors.${state.error}`, { time: "" }) : t("errors.GENERIC")}
        </p>
      )}
      {state.created && (
        <p role="status" className="col-span-2 text-emerald-800">
          {t("walkInForm.created", { time: state.time ?? "" })}
        </p>
      )}
      <button type="submit" disabled={pending} className="col-span-2 rounded-md bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-60">
        {t("walkInForm.submit")}
      </button>
    </form>
  );
}
