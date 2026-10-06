"use client";

import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Flag, LANGUAGE_NAMES } from "./Flag";

function Links({ label }: { label: string }) {
  const pathname = usePathname();
  const query = Object.fromEntries(useSearchParams());
  const current = useLocale();

  return (
    <nav aria-label={label} className="flex items-center gap-2">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={{ pathname, query }}
          locale={locale}
          lang={locale}
          aria-label={LANGUAGE_NAMES[locale]}
          title={LANGUAGE_NAMES[locale]}
          aria-current={locale === current ? "true" : undefined}
          className={`p-1 transition-opacity ${locale === current ? "border-b border-gold-deep" : "border-b border-transparent opacity-60 hover:opacity-100"}`}
        >
          <Flag locale={locale} />
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
