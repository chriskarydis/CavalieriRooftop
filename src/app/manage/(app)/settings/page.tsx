import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { loadSettings } from "@/server/services/context";
import { addClosedDate, removeClosedDate, saveSettings } from "../config-actions";
import { cardClass, inputClass, Notice, primaryButton, secondaryButton } from "../ui";

const CENTS = 100;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export default async function SettingsPage({ searchParams }: PageProps<"/manage/settings">) {
  await requirePermission("configuration");
  const t = await getTranslations("config");
  const query = await searchParams;
  const [settings, closures] = await Promise.all([
    loadSettings(db),
    db.select().from(schema.closure).orderBy(asc(schema.closure.date)),
  ]);

  const numberField = (name: keyof typeof settings, min: number, max: number) => (
    <label>
      {t(`settings.${name}`)}
      <input name={name} type="number" min={min} max={max} required defaultValue={Number(settings[name])} className={inputClass} />
    </label>
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold">{t("settings.title")}</h1>
        <p className="text-sm text-slate-600">{t("settings.intro")}</p>
      </header>
      <Notice query={query} />

      <form action={saveSettings} className="space-y-6">
        <section className={cardClass}>
          <h2 className="mb-3 font-semibold">{t("settings.money")}</h2>
          <div className="grid gap-3 text-sm font-medium sm:grid-cols-3">
            <label>
              {t("settings.deposit")}
              <input
                name="deposit"
                type="number"
                min={0}
                max={1000}
                step="0.01"
                required
                defaultValue={settings.depositPerPersonCents / CENTS}
                className={inputClass}
              />
            </label>
            {numberField("minBillableGuests", 1, 10)}
            {numberField("refundCutoffHours", 0, 720)}
          </div>
        </section>

        <section className={cardClass}>
          <h2 className="mb-3 font-semibold">{t("settings.timing")}</h2>
          <div className="grid gap-3 text-sm font-medium sm:grid-cols-4">
            {numberField("diningMinutes", 30, 600)}
            {numberField("blockMinutes", 30, 600)}
            {numberField("graceMinutes", 0, 120)}
            {numberField("holdMinutes", 2, 60)}
          </div>
        </section>

        <section className={cardClass}>
          <h2 className="mb-3 font-semibold">{t("settings.booking")}</h2>
          <div className="grid gap-3 text-sm font-medium sm:grid-cols-4">
            {numberField("minOnlineParty", 1, 40)}
            {numberField("maxOnlineParty", 1, 40)}
            <label>
              {t("settings.seasonStart")}
              <input name="seasonStart" required pattern="\d{2}-\d{2}" defaultValue={settings.seasonStart} className={inputClass} />
            </label>
            <label>
              {t("settings.seasonEnd")}
              <input name="seasonEnd" required pattern="\d{2}-\d{2}" defaultValue={settings.seasonEnd} className={inputClass} />
            </label>
            <label className="sm:col-span-4">
              {t("settings.timeSlots")}
              <input name="timeSlots" required defaultValue={settings.timeSlots.join(", ")} className={inputClass} />
            </label>
            <fieldset className="sm:col-span-4">
              <legend>{t("settings.closedWeekdays")}</legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-normal">
                {WEEKDAYS.map((day) => (
                  <label key={day} className="flex items-center gap-1.5">
                    <input type="checkbox" name="closedWeekdays" value={day} defaultChecked={settings.closedWeekdays.includes(day)} />
                    {t(`settings.weekday.${day}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 sm:col-span-4">
              <input name="showMenuPrices" type="checkbox" defaultChecked={settings.showMenuPrices} />
              {t("settings.showMenuPrices")}
            </label>
          </div>
        </section>

        <section className={cardClass}>
          <h2 className="mb-1 font-semibold">{t("settings.privacy")}</h2>
          <p className="mb-3 text-sm text-slate-600">{t("settings.privacyNote")}</p>
          <label className="block max-w-xs text-sm font-medium">
            {t("settings.retentionMonths")}
            <input name="retentionMonths" type="number" min={1} max={240} defaultValue={settings.retentionMonths ?? ""} className={inputClass} />
          </label>
        </section>

        <button type="submit" className={primaryButton}>
          {t("save")}
        </button>
      </form>

      <section className={cardClass}>
        <h2 className="mb-1 font-semibold">{t("closures.title")}</h2>
        <p className="mb-3 text-sm text-slate-600">{t("closures.intro")}</p>
        <ul className="mb-4 space-y-2 text-sm">
          {closures.length === 0 && <li className="text-slate-600">{t("closures.none")}</li>}
          {closures.map((closure) => (
            <li key={closure.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {closure.date}
                {closure.reason && ` · ${closure.reason}`}
              </span>
              <form action={removeClosedDate.bind(null, closure.id)}>
                <button type="submit" className={secondaryButton}>
                  {t("closures.remove")}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addClosedDate} className="flex flex-wrap items-end gap-3 text-sm font-medium">
          <label>
            {t("closures.date")}
            <input name="date" type="date" required className={inputClass} />
          </label>
          <label className="min-w-48 flex-1">
            {t("closures.reason")}
            <input name="reason" maxLength={200} className={inputClass} />
          </label>
          <button type="submit" className={primaryButton}>
            {t("closures.add")}
          </button>
        </form>
      </section>
    </main>
  );
}
