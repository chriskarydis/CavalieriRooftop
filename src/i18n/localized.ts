import { routing } from "./routing";

/**
 * Picks the text for a locale from database content. Falls back to the
 * default locale when the translation is missing or empty.
 */
export function localized(text: Record<string, string> | null | undefined, locale: string): string {
  if (!text) return "";
  return text[locale] || text[routing.defaultLocale] || "";
}
