import type { Metadata } from "next";
import { gte } from "drizzle-orm";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { SITE } from "@/config/site";
import { hasPermission } from "@/domain/permissions";
import { TABLE_PHOTOS } from "@/assets/tables";
import { zonedDate, zonedTime } from "@/domain/time";
import { formatLongDate } from "@/i18n/intl-locale";
import { localized } from "@/i18n/localized";
import { Link, redirect } from "@/i18n/navigation";
import { getStaff } from "@/server/auth/session";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { getFloorPlanView } from "@/server/floor/queries";
import { BookingError, loadFloorConfig } from "@/server/services/context";
import { getReservationByToken } from "@/server/services/guest-reservation";
import { canMove, getMoveOptions, type MoveOptions } from "@/server/services/reschedule";
import { PageHeader } from "@/ui/PageHeader";
import { ScrollTarget } from "@/ui/ScrollTarget";
import { moveByGuest } from "../../../reserve/actions";
import { BookingForm } from "../../../reserve/BookingForm";
import { RESULTS_ID } from "../../../reserve/results";
import { TablePicker, type PickerGroup, type PickerTable } from "../../../reserve/TablePicker";

// Carries the guest's secret token and must never be indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** The guest moves their own reservation to another evening or time and picks a table again. */
export default async function MoveReservationPage({ params, searchParams }: PageProps<"/[locale]/reservation/[token]/move">) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const found = await getReservationByToken(db, token);
  if (!found) notFound();
  const { reservation, tableNumbers, settings } = found;
  // Staff signed in to the management pages may make the change for the guest, without the guest's limits.
  const signedIn = await getStaff();
  const staff = signedIn !== null && hasPermission(signedIn.role, "operations") && ["CONFIRMED", "LATE"].includes(reservation.status);
  if (!staff && !canMove(reservation, settings, new Date())) return redirect({ href: `/reservation/${token}`, locale });

  const query = await searchParams;
  const requestedGuests = Number(first(query.guests));
  const guests = staff && Number.isInteger(requestedGuests) && requestedGuests > 0 ? requestedGuests : reservation.partySize;
  const date = first(query.date);
  const time = first(query.time);
  const errorCode = first(query.error);
  const t = await getTranslations("move");
  const tReserve = await getTranslations("reserve");
  const tPlan = await getTranslations("floorPlan");
  const format = await getFormatter();
  const today = zonedDate(new Date(), settings.timezone);
  const closures = await db.select({ date: schema.closure.date }).from(schema.closure).where(gte(schema.closure.date, today));

  let options: MoveOptions | null = null;
  let slotError: string | null = null;
  if (date && time) {
    try {
      options = await getMoveOptions(db, reservation.id, { date, time }, new Date(), staff ? { partySize: guests } : undefined);
    } catch (error) {
      if (!(error instanceof BookingError)) throw error;
      slotError = error.code;
    }
  }
  const failure = slotError ?? errorCode;
  const path = `/reservation/${token}/move`;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow={reservation.reference}
        title={t("title")}
        intro={t("intro", { guests: reservation.partySize, phone: SITE.phone })}
      />

      <div className="mx-auto max-w-5xl">
        {staff && <p className="notice notice-warn mb-4 font-medium">{t("staffBanner")}</p>}
        <p className="notice notice-info mb-4">
          {t("current", {
            date: formatLongDate(reservation.startsAt, locale, settings.timezone),
            time: zonedTime(reservation.startsAt, settings.timezone),
            table: tableNumbers.join(" + "),
          })}
        </p>
        <BookingForm
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
          initial={{ date, time: time ?? zonedTime(reservation.startsAt, settings.timezone), guests }}
          path={path}
          fixedGuests={!staff}
          openOn={zonedDate(reservation.startsAt, settings.timezone)}
        />
        <p className="mt-4 text-center text-sm">
          <Link href={`/reservation/${token}`} className="text-link">
            {t("back")}
          </Link>
        </p>
      </div>

      {(failure || options) && (
        <ScrollTarget id={RESULTS_ID} watch={`${date}-${time}-${guests}-${failure}`} className="scroll-mt-6 space-y-8">
          {failure && (
            <p role="alert" className="notice notice-error mx-auto max-w-5xl">
              {tReserve.has(`errors.${failure}`) ? tReserve(`errors.${failure}`) : tReserve("errors.GENERIC")}
            </p>
          )}
          {options && date && time && (
            <MoveChoices
              options={options}
              slot={{ date, time, guests }}
              staff={staff}
              locale={locale}
              token={token}
              paid={format.number(options.paidCents / 100, { style: "currency", currency: "EUR" })}
              areaLabels={Object.fromEntries(
                ["toilets", "entrance", "kitchen", "bar", "viewTop", "viewBottom", "viewLeft", "viewRight"].map((key) => [
                  key,
                  tPlan(`areas.${key}`),
                ]),
              )}
            />
          )}
        </ScrollTarget>
      )}
    </main>
  );
}

async function MoveChoices({
  options,
  slot,
  locale,
  token,
  paid,
  areaLabels,
  staff,
}: {
  options: MoveOptions;
  slot: { date: string; time: string; guests: number };
  locale: string;
  token: string;
  paid: string;
  areaLabels: Record<string, string>;
  staff: boolean;
}) {
  const t = await getTranslations("move");
  const [plan, config] = await Promise.all([getFloorPlanView(), loadFloorConfig(db)]);
  if (!plan) return null;

  const view = new Map(plan.tables.map((table) => [table.id, table]));
  const categoryName = new Map(plan.categories.map((category) => [category.id, localized(category.name, locale)]));
  const tables: PickerTable[] = options.tables.map((table) => ({
    tableId: table.tableId,
    state: table.state,
    price: table.price,
    categoryName: categoryName.get(view.get(table.tableId)?.categoryId ?? "") ?? "",
    viewDescription: localized(view.get(table.tableId)?.viewDescription, locale),
    photos: TABLE_PHOTOS[view.get(table.tableId)?.number ?? -1],
  }));
  const numberOf = new Map(config.tables.map((table) => [table.id, table.number]));
  const groups: PickerGroup[] = options.groups.map((group) => ({
    ...group,
    tableNumbers: group.tableIds.map((id) => numberOf.get(id) ?? 0).sort((a, b) => a - b),
  }));
  const free = tables.filter((table) => table.state === "AVAILABLE");
  if (free.length === 0 && groups.length === 0) {
    return <p className="notice notice-info mx-auto max-w-5xl">{t("nothing")}</p>;
  }

  // What to suggest: the guest's own table first, then another of the same category.
  const [ownId] = options.currentTableIds.length === 1 ? options.currentTableIds : [];
  const ownFree = ownId !== undefined && free.some((table) => table.tableId === ownId);
  const ownCategoryId = ownId ? view.get(ownId)?.categoryId : undefined;
  const sameCategory = free.filter((table) => table.tableId !== ownId && view.get(table.tableId)?.categoryId === ownCategoryId);
  const category = categoryName.get(ownCategoryId ?? "") ?? "";
  const numbers = (list: PickerTable[]): string =>
    list
      .map((table) => numberOf.get(table.tableId) ?? 0)
      .sort((a, b) => a - b)
      .join(", ");

  return (
    <section>
      <div className="mx-auto mb-8 max-w-5xl space-y-3 text-center">
        <h2 className="text-3xl sm:text-4xl">{t("chooseTitle")}</h2>
        {ownId !== undefined && (
          <p className={`notice text-left ${ownFree || sameCategory.length > 0 ? "notice-ok" : "notice-warn"}`}>
            {ownFree
              ? t("sameTable", { table: numberOf.get(ownId) ?? 0 })
              : sameCategory.length > 0
                ? t("sameCategory", { category, tables: numbers(sameCategory) })
                : t("lowerOnly", { category })}
          </p>
        )}
        {!staff && <p className="text-sm text-muted">{t("paidNote", { amount: paid })}</p>}
      </div>
      <TablePicker
        plan={plan}
        tables={tables}
        groups={groups}
        slot={slot}
        locale={locale}
        areaLabels={areaLabels}
        move={{
          action: moveByGuest.bind(null, token),
          paidCents: options.paidCents,
          staff,
          initialTableId: ownFree ? ownId : null,
        }}
      />
    </section>
  );
}
