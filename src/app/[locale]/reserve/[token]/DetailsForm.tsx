"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { OCCASIONS } from "@/server/db/occasions";
import { submitDetails, type DetailsState } from "../actions";

const INITIAL: DetailsState = { error: null };

export function DetailsForm({
  token,
  locale,
  refundHours,
  graceMinutes,
}: {
  token: string;
  locale: string;
  refundHours: number;
  graceMinutes: number;
}) {
  const t = useTranslations("checkout");
  const [state, action, pending] = useActionState(submitDetails.bind(null, token, locale), INITIAL);
  const inputClass = "field";

  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium">
        {t("name")}
        <input name="name" required minLength={2} maxLength={120} autoComplete="name" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        {t("email")}
        <input name="email" type="email" required maxLength={200} autoComplete="email" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        {t("phone")}
        <input name="phone" type="tel" required minLength={6} maxLength={40} autoComplete="tel" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        {t("occasion")}
        <select name="occasion" defaultValue="" className={inputClass}>
          <option value="">{t("occasionNone")}</option>
          {OCCASIONS.map((occasion) => (
            <option key={occasion} value={occasion}>
              {t(`occasions.${occasion}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        {t("notes")}
        <textarea name="notes" maxLength={500} rows={2} className={inputClass} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input name="acceptPolicy" type="checkbox" required className="mt-1" />
        <span>{t("acceptPolicy", { hours: refundHours, minutes: graceMinutes })}</span>
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {t(`detailsError.${state.error}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {t("continue")}
      </button>
    </form>
  );
}
