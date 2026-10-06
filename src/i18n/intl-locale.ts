/**
 * The locale to format dates with. The site's English is international, so
 * weekday and month names follow British usage rather than American.
 */
export function intlLocale(locale: string): string {
  return locale === "en" ? "en-GB" : locale;
}

/**
 * Dates are written dd/mm/yyyy everywhere, in both languages (owner's rule).
 * "12/08/2027" in the given timezone.
 */
export function formatDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone }).formatToParts(instant);
  const part = (type: string): string => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")}`;
}

/** "Thursday 12/08/2027" in the restaurant's timezone: the weekday in words, then the date. */
export function formatLongDate(instant: Date, locale: string, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", timeZone }).format(instant);
  return `${weekday} ${formatDate(instant, timeZone)}`;
}

/** "12/08/2027" from a YYYY-MM-DD calendar date. */
export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
