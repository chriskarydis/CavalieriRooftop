import type { Metadata } from "next";
import Image from "next/image";
import { Inter, Noto_Serif_Display } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import logo from "@/assets/photos/logo.png";
import { SITE, siteUrl } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LocaleSwitcher } from "@/ui/LocaleSwitcher";
import "../globals.css";

const sans = Inter({ subsets: ["latin", "greek"], variable: "--font-inter", display: "swap" });
const display = Noto_Serif_Display({ subsets: ["latin", "greek"], variable: "--font-noto", display: "swap" });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "site" });
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${t("name")} · ${t("tagline")}`, template: `%s · ${t("name")}` },
    description: t("description"),
    openGraph: {
      type: "website",
      siteName: t("name"),
      locale: locale === "el" ? "el_GR" : "en_GB",
      title: t("name"),
      description: t("description"),
    },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("site");
  const footerLink = "hover:underline";

  return (
    <html lang={locale} className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">
            {t("skipToContent")}
          </a>
          <header className="border-b border-stone-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
              <Link href="/" className="shrink-0">
                <Image src={logo} alt={t("name")} priority sizes="170px" className="h-11 w-auto sm:h-12" />
              </Link>
              <nav aria-label={t("mainNav")} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <Link href="/menu" className="hover:underline">
                  {t("menu")}
                </Link>
                <Link href="/gallery" className="hover:underline">
                  {t("gallery")}
                </Link>
                <Link href="/contact" className="hover:underline">
                  {t("contact")}
                </Link>
                <LocaleSwitcher label={t("language")} />
                <Link href="/reserve" className="rounded-md bg-accent px-3 py-2 font-medium whitespace-nowrap text-white hover:bg-accent-dark">
                  {t("reserveCta")}
                </Link>
              </nav>
            </div>
          </header>

          <div id="content" className="flex flex-1 flex-col">
            {children}
          </div>

          <footer className="mt-12 bg-sea text-stone-100">
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
              <div>
                <p className="font-display text-lg font-semibold">{t("name")}</p>
                <address className="mt-2 not-italic leading-relaxed">
                  {SITE.street}, {SITE.postalCode} {SITE.city[locale as "en" | "el"]}
                  <br />
                  <a href={SITE.phoneHref} className={footerLink}>
                    {SITE.phone}
                  </a>
                  <br />
                  <a href={`mailto:${SITE.email}`} className={footerLink}>
                    {SITE.email}
                  </a>
                </address>
              </div>
              <nav aria-label={t("footerNav")}>
                <ul className="space-y-1.5">
                  <li>
                    <Link href="/reserve" className={footerLink}>
                      {t("reserveCta")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/menu" className={footerLink}>
                      {t("menu")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/gallery" className={footerLink}>
                      {t("gallery")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/contact" className={footerLink}>
                      {t("contact")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/policy" className={footerLink}>
                      {t("policy")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/privacy" className={footerLink}>
                      {t("privacy")}
                    </Link>
                  </li>
                </ul>
              </nav>
              <ul className="space-y-1.5">
                <li>
                  <a href={SITE.social.instagram} rel="noopener" className={footerLink}>
                    Instagram
                  </a>
                </li>
                <li>
                  <a href={SITE.social.facebook} rel="noopener" className={footerLink}>
                    Facebook
                  </a>
                </li>
                <li>
                  <a href={SITE.social.tripadvisor} rel="noopener" className={footerLink}>
                    Tripadvisor
                  </a>
                </li>
              </ul>
            </div>
            <p className="border-t border-white/15 px-4 py-4 text-center text-xs text-stone-300">
              {SITE.legalName} · {t("vat", { number: SITE.vatNumber })}
            </p>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
