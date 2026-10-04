"use client";

import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const NAMES: Record<string, string> = { en: "English", el: "Ελληνικά" };

function Links({ label }: { label: string }) {
  const pathname = usePathname();
  const query = Object.fromEntries(useSearchParams());
  const current = useLocale();

  return (
    <nav aria-label={label} className="flex gap-2 text-sm">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={{ pathname, query }}
          locale={locale}
          lang={locale}
          aria-current={locale === current ? "true" : undefined}
          className={locale === current ? "font-semibold underline" : "text-stone-600 hover:underline"}
        >
          {NAMES[locale]}
        </Link>
      ))}
    </nav>
  );
}

/** Switches language while staying on the same page with the same query. */
export function LocaleSwitcher({ label }: { label: string }) {
  return (
    <Suspense>
      <Links label={label} />
    </Suspense>
  );
}
