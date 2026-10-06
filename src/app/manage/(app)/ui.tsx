import { getTranslations } from "next-intl/server";

export const inputClass = "mt-1 w-full rounded border border-stone-300 bg-white px-2.5 py-2 font-normal";
export const primaryButton = "rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-gold-deep";
export const secondaryButton = "rounded border border-stone-300 bg-white px-2.5 py-1 text-sm hover:border-ink";
export const cardClass = "rounded-lg border border-line bg-white p-5 shadow-sm";

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
