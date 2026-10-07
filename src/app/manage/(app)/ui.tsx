import { getTranslations } from "next-intl/server";

export { cardClass, inputClass, primaryButton, secondaryButton } from "./styles";

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** "Saved" or the broken rule, after a configuration form was submitted. */
export async function Notice({ query }: { query: Record<string, string | string[] | undefined> }) {
  const t = await getTranslations("config");
  const error = first(query.error);
  const upcoming = first(query.upcoming);
  const upcomingMany = first(query.upcomingMany);
  const changed = first(query.changed);
  const daysClosed = first(query.daysClosed);
  const daysOpened = first(query.daysOpened);
  const daysKept = first(query.daysKept);
  const daysCancelled = first(query.daysCancelled);
  const daysUnrefunded = Number(first(query.daysUnrefunded) ?? 0);
  const day = (value: string | undefined): string => (value ?? "").split("-").reverse().join("/");
  const period = { from: day(first(query.from)), to: day(first(query.to)) };

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
        {daysClosed
          ? t("tables.daysClosed", { count: Number(daysClosed), ...period })
          : daysOpened
            ? t("tables.daysOpened", { count: Number(daysOpened), ...period })
            : changed
              ? t("tables.bulkChanged", { count: Number(changed) })
              : t("saved")}
      </p>
      {daysCancelled && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {t("tables.daysCancelled", {
            count: Number(daysCancelled),
            amount: (Number(first(query.daysRefunded) ?? 0) / 100).toFixed(2),
          })}
        </p>
      )}
      {daysUnrefunded > 0 && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {t("tables.daysUnrefunded", { count: daysUnrefunded })}
        </p>
      )}
      {daysKept && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {t("tables.daysKept", { count: Number(daysKept) })}
        </p>
      )}
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
