import { asc } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { localized } from "@/i18n/localized";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { saveTable } from "../config-actions";
import { setTablesStatusAction } from "../floor-actions";
import { zonedDate } from "@/domain/time";
import { loadSettings } from "@/server/services/context";
import { cardClass, inputClass, Notice, primaryButton } from "../ui";
import { BulkTables } from "./BulkTables";

const STATUSES = ["ACTIVE", "INACTIVE", "OUT_OF_SERVICE"] as const;

export default async function TablesPage({ searchParams }: PageProps<"/manage/tables">) {
  await requirePermission("configuration");
  const t = await getTranslations("config");
  const locale = await getLocale();
  const query = await searchParams;
  const [tables, categories] = await Promise.all([
    db.select().from(schema.diningTable).orderBy(asc(schema.diningTable.number)),
    db.select().from(schema.tableCategory).orderBy(asc(schema.tableCategory.displayOrder)),
  ]);
  const settings = await loadSettings(db);
  const categoryName = new Map(categories.map((category) => [category.id, localized(category.name, locale)]));

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-lg font-semibold">{t("tables.title")}</h1>
        <p className="text-sm text-slate-600">{t("tables.intro")}</p>
      </header>
      <Notice query={query} />

      <section className={cardClass}>
        <h2 className="font-semibold">{t("tables.bulkTitle")}</h2>
        <p className="mb-3 text-sm text-slate-600">{t("tables.bulkIntro")}</p>
        <BulkTables
          tables={tables.map((table) => ({
            id: table.id,
            label: table.isSpare ? t("tables.spare") : String(table.number),
            active: table.status === "ACTIVE",
          }))}
          today={zonedDate(new Date(), settings.timezone)}
          closeAction={setTablesStatusAction.bind(null, "OUT_OF_SERVICE")}
          openAction={setTablesStatusAction.bind(null, "ACTIVE")}
          labels={{
            tables: t("tables.title"),
            selectAll: t("tables.selectAll"),
            selectNone: t("tables.selectNone"),
            // The count is filled in as tables are ticked.
            selected: t.raw("tables.selected") as string,
            howLong: t("tables.howLong"),
            always: t("tables.always"),
            days: t("tables.days"),
            from: t("tables.daysFrom"),
            to: t("tables.daysTo"),
            daysHint: t("tables.daysHint"),
            reason: t("tables.bulkReason"),
            close: t("tables.bulkClose"),
            open: t("tables.bulkOpen"),
          }}
        />
      </section>

      <ul className="space-y-2">
        {tables.map((table) => (
          <li key={table.id}>
            <details className={cardClass} open={query.table === String(table.number) && Boolean(query.error)}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1">
                <span className="w-24 font-semibold">
                  {t("tables.table", { number: table.isSpare ? t("tables.spare") : String(table.number) })}
                </span>
                <span className="text-sm text-slate-600">
                  {t("tables.seats", { capacity: table.capacity, max: table.maxCapacity })}
                </span>
                <span className="text-sm text-slate-600">{categoryName.get(table.categoryId)}</span>
                <span className={`text-sm ${table.status === "ACTIVE" ? "text-emerald-700" : "font-medium text-red-700"}`}>
                  {t(`tables.status.${table.status}`)}
                </span>
                {!table.onlineBookable && <span className="text-sm text-slate-500">{t("tables.notOnline")}</span>}
                {table.onlineBookable && !table.autoAssignable && (
                  <span className="text-sm text-slate-500">{t("tables.notAuto")}</span>
                )}
              </summary>

              <form action={saveTable.bind(null, table.id)} className="mt-4 grid gap-3 text-sm font-medium sm:grid-cols-4">
                <input type="hidden" name="number" value={table.number} />
                <label>
                  {t("tables.capacity")}
                  <input name="capacity" type="number" min={1} max={30} defaultValue={table.capacity} required className={inputClass} />
                </label>
                <label>
                  {t("tables.maxCapacity")}
                  <input name="maxCapacity" type="number" min={1} max={30} defaultValue={table.maxCapacity} required className={inputClass} />
                </label>
                <label>
                  {t("tables.category")}
                  <select name="categoryId" defaultValue={table.categoryId} className={inputClass}>
                    {categories
                      .filter((category) => category.active || category.id === table.categoryId)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {localized(category.name, locale)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {t("tables.priority")}
                  <input name="priority" type="number" min={-100} max={100} defaultValue={table.priority} required className={inputClass} />
                </label>
                <label>
                  {t("tables.statusLabel")}
                  <select name="status" defaultValue={table.status} className={inputClass}>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {t(`tables.status.${status}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sm:col-span-3">
                  {t("tables.statusReason")}
                  <input name="statusReason" maxLength={200} defaultValue={table.statusReason ?? ""} className={inputClass} />
                </label>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input name="onlineBookable" type="checkbox" defaultChecked={table.onlineBookable} />
                  {t("tables.onlineBookable")}
                </label>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input name="autoAssignable" type="checkbox" defaultChecked={table.autoAssignable} />
                  {t("tables.autoAssignable")}
                </label>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input name="billBySeats" type="checkbox" defaultChecked={table.billBySeats} />
                  {t("tables.billBySeats")}
                </label>
                <label className="sm:col-span-2">
                  {t("tables.viewEn")}
                  <input name="viewEn" maxLength={300} defaultValue={table.viewDescription?.en ?? ""} className={inputClass} />
                </label>
                <label className="sm:col-span-2">
                  {t("tables.viewEl")}
                  <input name="viewEl" maxLength={300} defaultValue={table.viewDescription?.el ?? ""} className={inputClass} />
                </label>
                <label className="sm:col-span-4">
                  {t("tables.notes")}
                  <input name="notes" maxLength={500} defaultValue={table.notes ?? ""} className={inputClass} />
                </label>
                <div className="sm:col-span-4">
                  <button type="submit" className={primaryButton}>
                    {t("save")}
                  </button>
                </div>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </main>
  );
}
