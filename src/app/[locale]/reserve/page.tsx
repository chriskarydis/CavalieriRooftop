import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { zonedDate } from "@/domain/time";
import { localized } from "@/i18n/localized";
import { db } from "@/server/db/client";
import { getFloorPlanView } from "@/server/floor/queries";
import { getAvailability, type Availability } from "@/server/services/booking";
import { BookingError, loadFloorConfig, loadSettings } from "@/server/services/context";
import { startHold } from "./actions";
import { PriceSummary } from "./PriceSummary";
import { TablePicker, type PickerGroup, type PickerTable } from "./TablePicker";

export async function generateMetadata({ params }: PageProps<"/[locale]/reserve">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "reserve" });
  return { title: t("title"), description: t("intro") };
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export default async function ReservePage({ params, searchParams }: PageProps<"/[locale]/reserve">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const t = await getTranslations("reserve");
  const settings = await loadSettings(db);

  const date = first(query.date);
  const time = first(query.time);
  const guests = Number(first(query.guests) ?? 2);
  const errorCode = first(query.error);
  const today = zonedDate(new Date(), settings.timezone);

  let availability: Availability | null = null;
  let slotError: string | null = null;
  if (date && time) {
    try {
      availability = await getAvailability(db, { date, time, partySize: guests });
    } catch (error) {
      if (!(error instanceof BookingError)) throw error;
      slotError = error.code;
    }
  }

  const inputClass = "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2";

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-4 pb-16">
      <header>
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-stone-700">{t("intro")}</p>
      </header>

      <form method="get" className="grid gap-4 rounded-xl border border-stone-300 bg-white p-4 sm:grid-cols-4 sm:items-end">
        <label className="text-sm font-medium">
          {t("date")}
          <input type="date" name="date" required min={today} defaultValue={date ?? ""} className={inputClass} />
        </label>
        <label className="text-sm font-medium">
          {t("time")}
          <select name="time" required defaultValue={time ?? "20:00"} className={inputClass}>
            {settings.timeSlots.map((slot) => (
              <option key={slot}>{slot}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          {t("guests")}
          <select name="guests" defaultValue={guests} className={inputClass}>
            {Array.from({ length: settings.maxOnlineParty - settings.minOnlineParty + 1 }, (_, index) => (
              <option key={index}>{settings.minOnlineParty + index}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md bg-stone-900 px-4 py-2.5 font-medium text-white">
          {t("check")}
        </button>
        <p className="text-sm text-stone-600 sm:col-span-4">
          {t("largeParty", { max: settings.maxOnlineParty })}{" "}
          <a href="tel:+302661039041" className="underline">
            {t("contactUs")}
          </a>
        </p>
      </form>

      {(slotError || errorCode) && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {t.has(`errors.${slotError ?? errorCode}`) ? t(`errors.${slotError ?? errorCode}`) : t("errors.GENERIC")}
        </p>
      )}

      {availability && date && time && (
        <AvailabilitySection availability={availability} slot={{ date, time, guests }} locale={locale} />
      )}
    </main>
  );
}

async function AvailabilitySection({
  availability,
  slot,
  locale,
}: {
  availability: Availability;
  slot: { date: string; time: string; guests: number };
  locale: string;
}) {
  const t = await getTranslations("reserve");
  const tPlan = await getTranslations("floorPlan");
  const [plan, config] = await Promise.all([getFloorPlanView(), loadFloorConfig(db)]);
  if (!plan) return null;

  const view = new Map(plan.tables.map((table) => [table.id, table]));
  const categoryName = new Map(plan.categories.map((category) => [category.id, localized(category.name, locale)]));
  const tables: PickerTable[] = availability.tables.map((table) => ({
    tableId: table.tableId,
    state: table.state,
    price: table.price,
    categoryName: categoryName.get(view.get(table.tableId)?.categoryId ?? "") ?? "",
    viewDescription: localized(view.get(table.tableId)?.viewDescription, locale),
  }));
  const numberOf = new Map(config.tables.map((table) => [table.id, table.number]));
  const groups: PickerGroup[] = availability.groups.map((group) => ({
    ...group,
    tableNumbers: group.tableIds.map((id) => numberOf.get(id) ?? 0).sort((a, b) => a - b),
  }));
  const nothingFree = !availability.auto && groups.length === 0 && tables.every((table) => table.state !== "AVAILABLE");

  if (nothingFree) {
    return <p className="rounded-md border border-stone-300 bg-white p-4">{t("errors.NO_AVAILABILITY")}</p>;
  }

  return (
    <>
      {availability.auto && (
        <section className="rounded-xl border border-stone-300 bg-white p-4">
          <h2 className="text-xl font-semibold">{t("autoTitle")}</h2>
          <p className="mb-3 text-stone-700">{t("autoText")}</p>
          <div className="max-w-sm">
            <PriceSummary price={availability.auto.price} />
            <form action={startHold} className="mt-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="date" value={slot.date} />
              <input type="hidden" name="time" value={slot.time} />
              <input type="hidden" name="guests" value={slot.guests} />
              <input type="hidden" name="mode" value="AUTO" />
              <button type="submit" className="w-full rounded-md bg-stone-900 px-4 py-3 font-medium text-white">
                {t("autoButton")}
              </button>
            </form>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold">{t("chooseTitle")}</h2>
        <p className="mb-4 text-stone-700">{t("chooseText")}</p>
        <TablePicker
          plan={plan}
          tables={tables}
          groups={groups}
          slot={slot}
          locale={locale}
          areaLabels={{
            toilets: tPlan("areas.toilets"),
            entrance: tPlan("areas.entrance"),
            kitchen: tPlan("areas.kitchen"),
            bar: tPlan("areas.bar"),
          }}
        />
      </section>
    </>
  );
}
