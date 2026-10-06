import { getLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { Flag, LANGUAGE_NAMES } from "@/ui/Flag";
import { setStaffLocale } from "./actions";

/** Language choice for the management application, remembered in a cookie. */
export async function StaffLocaleSwitcher() {
  const current = await getLocale();
  return (
    <div className="flex items-center gap-2">
      {routing.locales.map((locale) => (
        <form key={locale} action={setStaffLocale.bind(null, locale)}>
          <button
            type="submit"
            lang={locale}
            aria-label={LANGUAGE_NAMES[locale]}
            title={LANGUAGE_NAMES[locale]}
            aria-current={locale === current ? "true" : undefined}
            className={`block border-b p-1 ${locale === current ? "border-slate-900" : "border-transparent opacity-55 hover:opacity-100"}`}
          >
            <Flag locale={locale} />
          </button>
        </form>
      ))}
    </div>
  );
}
