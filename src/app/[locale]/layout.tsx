import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LocaleSwitcher } from "@/ui/LocaleSwitcher";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return { title: { default: t("name"), template: `%s · ${t("name")}` }, description: t("tagline") };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("site");

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <header className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
            <Link href="/" className="font-semibold">
              {t("name")}
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/menu" className="text-sm hover:underline">
                {t("menu")}
              </Link>
              <LocaleSwitcher label={t("language")} />
              <Link href="/reserve" className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white">
                {t("reserveCta")}
              </Link>
            </div>
          </header>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
