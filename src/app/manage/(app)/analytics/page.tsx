import { DateField } from "../DateField";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { zonedDate } from "@/domain/time";
import { intlLocale } from "@/i18n/intl-locale";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getAnalytics } from "@/server/services/analytics";
import { loadSettings } from "@/server/services/context";
import { cardClass, inputClass, primaryButton, secondaryButton } from "../ui";

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);
const isDate = (value: string | undefined): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/** One headline number with its label. */
function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={cardClass}>
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-600">{note}</p>}
    </div>
  );
}

/**
 * A ranked list with one bar per row. One measure, one colour; every value is
 * written out, so the list is also its own table.
 */
function BarList({ title, rows, empty }: { title: string; rows: Array<{ label: string; value: number; display: string }>; empty: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className={cardClass}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 || rows.every((row) => row.value === 0) ? (
        <p className="text-sm text-slate-600">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} title={`${row.label}: ${row.display}`}>
                <th scope="row" className="w-28 py-1 pr-2 text-left font-normal whitespace-nowrap text-slate-700">
                  {row.label}
                </th>
                <td className="py-1">
                  <span
                    aria-hidden
                    className="block h-3 rounded-r bg-sea"
                    style={{ width: `${(row.value / max) * 100}%`, minWidth: row.value > 0 ? "2px" : 0 }}
                  />
                </td>
                <td className="w-24 py-1 pl-2 text-right tabular-nums">{row.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/manage/analytics">) {
  await requirePermission("analytics");
  const t = await getTranslations("analytics");
  const format = await getFormatter();
  const locale = intlLocale(await getLocale());
  const query = await searchParams;
  const settings = await loadSettings(db);

  const today = zonedDate(new Date(), settings.timezone);
  const to = isDate(first(query.to)) ? first(query.to)! : today;
  const requestedFrom = first(query.from);
  const from = isDate(requestedFrom) && requestedFrom <= to ? requestedFrom : `${to.slice(0, 8)}01`;
  const data = await getAnalytics(db, { from, to });

  const euro = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const whole = (value: number) => format.number(value, { maximumFractionDigits: 0 });
  const share = (value: number) => format.number(value, { style: "percent", maximumFractionDigits: 0 });
  const weekdayName = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  // 1 January 2024 was a Monday, so ISO weekday n is the n-th of that month.
  const weekday = (iso: number) => weekdayName.format(new Date(Date.UTC(2024, 0, iso, 12)));
  const none = t("none");

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-600">{t("intro")}</p>
      </header>

      <form method="get" className={`${cardClass} flex flex-wrap items-end gap-3 text-sm font-medium`}>
        <label>
          {t("from")}
          <DateField name="from" defaultValue={from} required className={inputClass} />
        </label>
        <label>
          {t("to")}
          <DateField name="to" defaultValue={to} required className={inputClass} />
        </label>
        <button type="submit" className={primaryButton}>
          {t("show")}
        </button>
        <span className="ml-auto flex flex-wrap items-center gap-2 font-normal">
          <a href={`/manage/export?kind=reservations&from=${from}&to=${to}`} className={secondaryButton}>
            {t("exportReservations")}
          </a>
          <a href={`/manage/export?kind=summary&from=${from}&to=${to}`} className={secondaryButton}>
            {t("exportSummary")}
          </a>
        </span>
      </form>
      <p className="-mt-3 text-xs text-slate-600">{t("exportHint")}</p>

      <section aria-label={t("reservationsGroup")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("reservations")} value={whole(data.reservations)} />
        <Tile
          label={t("covers")}
          value={whole(data.covers)}
          note={t("averageParty", { size: format.number(data.averagePartySize, { maximumFractionDigits: 1 }) })}
        />
        <Tile label={t("cancellations")} value={whole(data.cancellations)} />
        <Tile label={t("noShows")} value={whole(data.noShows)} note={t("noShowRate", { rate: share(data.noShowRate) })} />
      </section>

      <section aria-label={t("moneyGroup")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("deposits")} value={euro(data.depositCents)} note={t("depositsNote")} />
        <Tile label={t("tableFees")} value={euro(data.tableFeeCents)} note={t("tableFeesNote")} />
        <Tile label={t("retained")} value={euro(data.retainedCents)} note={t("retainedNote")} />
        <Tile label={t("refunded")} value={euro(data.refundedCents)} />
      </section>

      <section aria-label={t("mixGroup")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t("chosenTable")} value={whole(data.chosenTable)} note={t("autoAssigned", { count: data.autoAssigned })} />
        <Tile label={t("tableUse")} value={share(data.tableUse)} note={t("tableUseNote")} />
        <Tile label={t("walkIns")} value={whole(data.walkIns)} note={t("walkInCovers", { count: data.walkInCovers })} />
        <Tile label={t("walkInsDrinks")} value={whole(data.walkInsForDrinks)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          title={t("byHour")}
          empty={none}
          rows={data.byHour.map((row) => ({ label: row.label, value: row.count, display: whole(row.count) }))}
        />
        <BarList
          title={t("byWeekday")}
          empty={none}
          rows={data.coversByWeekday.map((row) => ({ label: weekday(row.weekday), value: row.covers, display: whole(row.covers) }))}
        />
        <BarList
          title={t("chosenTables")}
          empty={none}
          rows={data.chosenTables.map((row) => ({
            label: t("tableLabel", { number: row.tableNumber }),
            value: row.count,
            display: `${whole(row.count)} · ${euro(row.feeCents)}`,
          }))}
        />
        <BarList
          title={t("feeByCategory")}
          empty={none}
          rows={data.feeByCategory.map((row) => ({
            label: row.category,
            value: row.feeCents,
            display: `${euro(row.feeCents)} · ${whole(row.count)}`,
          }))}
        />
      </div>
    </main>
  );
}
