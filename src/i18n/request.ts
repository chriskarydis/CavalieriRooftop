import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { routing } from "./routing";

/** Remembers the language staff chose in the management application, which has no locale in its URL. */
export const STAFF_LOCALE_COOKIE = "crg_staff_locale";

export default getRequestConfig(async ({ requestLocale }) => {
  // Public pages carry the locale in the URL; the management application uses the cookie.
  const requested = (await requestLocale) ?? (await cookies()).get(STAFF_LOCALE_COOKIE)?.value;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
