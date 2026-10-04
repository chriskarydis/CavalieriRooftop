import { routing } from "./routing";

/** Picks the text for a locale from database content, falling back to the default locale. */
export function localized(text: Record<string, string> | null | undefined, locale: string): string {
  if (!text) return "";
  return text[locale] ?? text[routing.defaultLocale] ?? "";
}
