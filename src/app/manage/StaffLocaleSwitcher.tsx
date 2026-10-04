import { getLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { setStaffLocale } from "./actions";

const NAMES: Record<string, string> = { en: "English", el: "Ελληνικά" };

/** Language choice for the management application, remembered in a cookie. */
export async function StaffLocaleSwitcher() {
  const current = await getLocale();
  return (
    <div className="flex gap-2 text-sm">
      {routing.locales.map((locale) => (
        <form key={locale} action={setStaffLocale.bind(null, locale)}>
          <button
            type="submit"
            lang={locale}
            aria-current={locale === current ? "true" : undefined}
            className={locale === current ? "font-semibold underline" : "text-slate-600 hover:underline"}
          >
            {NAMES[locale]}
          </button>
        </form>
      ))}
    </div>
  );
}
