import type { Metadata } from "next";
import { gte } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { zonedDate } from "@/domain/time";
import { localized } from "@/i18n/localized";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { getFloorPlanView } from "@/server/floor/queries";
import { getAvailability, type Availability } from "@/server/services/booking";
import { BookingError, loadFloorConfig, loadSettings } from "@/server/services/context";
import { PageHeader } from "@/ui/PageHeader";
import { startHold } from "./actions";
import { BookingForm } from "./BookingForm";
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
  const tSite = await getTranslations("site");
  const settings = await loadSettings(db);

  const date = first(query.date);
  const time = first(query.time);
  const guests = Number(first(query.guests) ?? 2);
  const errorCode = first(query.error);
  const today = zonedDate(new Date(), settings.timezone);
  const closures = await db.select({ date: schema.closure.date }).from(schema.closure).where(gte(schema.closure.date, today));

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

  return (
    <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader eyebrow={tSite("name")} title={t("title")} intro={t("intro")} />

      <div>
        <BookingForm
          // A new search starts again from the values in the address.
          key={`${date}-${time}-${guests}`}
          locale={locale}
          today={today}
          opening={{
            seasonStart: settings.seasonStart,
            seasonEnd: settings.seasonEnd,
            closedWeekdays: settings.closedWeekdays,
          }}
          closedDates={closures.map((row) => row.date)}
          timeSlots={settings.timeSlots}
          minParty={settings.minOnlineParty}
          maxParty={settings.maxOnlineParty}
          initial={{ date, time, guests }}
        />
        <p className="mt-4 text-center text-sm text-muted">
          {t("largeParty", { max: settings.maxOnlineParty })}{" "}
          <a href="tel:+302661039041" className="text-link">
            {t("contactUs")}
          </a>
        </p>
      </div>

      {(slotError || errorCode) && (
        <p role="alert" className="notice notice-error">
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
    return <p className="notice notice-info">{t("errors.NO_AVAILABILITY")}</p>;
  }

  return (
    <>
      {availability.auto && (
        <section className="panel grid gap-6 md:grid-cols-2 md:items-center">
          <div>
            <p className="eyebrow">{t("autoEyebrow")}</p>
            <h2 className="mt-2 text-2xl sm:text-3xl">{t("autoTitle")}</h2>
            <p className="mt-2 text-muted">{t("autoText")}</p>
          </div>
          <div>
            <PriceSummary price={availability.auto.price} />
            <form action={startHold} className="mt-4">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="date" value={slot.date} />
              <input type="hidden" name="time" value={slot.time} />
              <input type="hidden" name="guests" value={slot.guests} />
              <input type="hidden" name="mode" value="AUTO" />
              <button type="submit" className="btn btn-outline w-full">
                {t("autoButton")}
              </button>
            </form>
          </div>
        </section>
      )}

      <section>
        <div className="mb-8 text-center">
          <p className="eyebrow">{t("chooseEyebrow")}</p>
          <h2 className="mt-2 text-3xl sm:text-4xl">{t("chooseTitle")}</h2>
          <p className="mt-2 text-muted">{t("chooseText")}</p>
        </div>
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
