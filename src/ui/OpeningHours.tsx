import { getLocale, getTranslations } from "next-intl/server";
import { SITE } from "@/config/site";
import { intlLocale } from "@/i18n/intl-locale";
import type { OpeningSummary } from "@/server/services/opening";

/** "Open 1 May to 10 October, 18:30 – 00:00. Closed on Monday." from the live settings. */
export async function OpeningHours({ opening }: { opening: OpeningSummary }) {
  const t = await getTranslations("site");
  const locale = intlLocale(await getLocale());
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" });
  const weekdayName = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  // 1 January 2024 was a Monday, so ISO weekday n is the n-th of that month.
  const weekday = (iso: number): string => weekdayName.format(new Date(Date.UTC(2024, 0, iso, 12)));
  const list = new Intl.ListFormat(locale, { type: "conjunction" });

  return (
    <p>
      {t("season", { from: day.format(opening.seasonStart), to: day.format(opening.seasonEnd) })}
      <br />
      {t("hours", { opens: SITE.opens, closes: SITE.closes })}
      {opening.closedWeekdays.length > 0 && (
        <>
          <br />
          {t("closedOn", { days: list.format(opening.closedWeekdays.map(weekday)) })}
        </>
      )}
    </p>
  );
}
