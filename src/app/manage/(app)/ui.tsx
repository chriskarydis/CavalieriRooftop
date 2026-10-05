import { getTranslations } from "next-intl/server";

export const inputClass = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-normal";
export const primaryButton = "rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white";
export const secondaryButton = "rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100";
export const cardClass = "rounded-xl border border-slate-200 bg-white p-4";

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** "Saved" or the broken rule, after a configuration form was submitted. */
export async function Notice({ query }: { query: Record<string, string | string[] | undefined> }) {
  const t = await getTranslations("config");
  const error = first(query.error);
  const upcoming = first(query.upcoming);
  const upcomingMany = first(query.upcomingMany);
  const changed = first(query.changed);

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
        {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.GENERIC")}
      </p>
    );
  }
  if (!first(query.saved)) return null;
  return (
    <div className="space-y-2">
      <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
        {changed ? t("tables.bulkChanged", { count: Number(changed) }) : t("saved")}
      </p>
      {upcomingMany && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t("tables.bulkUpcomingWarning", { count: Number(upcomingMany) })}
        </p>
      )}
      {upcoming && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t("tables.upcomingWarning", { count: Number(upcoming), table: first(query.table) ?? "" })}
        </p>
      )}
    </div>
  );
}
