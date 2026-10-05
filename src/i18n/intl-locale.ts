/**
 * The locale to format dates with. The site's English is international, so
 * dates read day-first ("12 August 2027") as in Greece and most of Europe,
 * not month-first as plain "en" would give.
 */
export function intlLocale(locale: string): string {
  return locale === "en" ? "en-GB" : locale;
}

/** "Thursday 12 August 2027" in the restaurant's timezone. */
export function formatLongDate(instant: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "full", timeZone }).format(instant);
}
