import type { Metadata } from "next";
import Image from "next/image";
import { Commissioner, GFS_Didot } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import logoOnDark from "@/assets/photos/logo-on-dark.png";
import logo from "@/assets/photos/logo.png";
import { SITE, siteUrl } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LocaleSwitcher } from "@/ui/LocaleSwitcher";
import "../globals.css";

// GFS Didot is the classic face of Greek book printing and Commissioner was drawn with Greek from
// the start, so the two languages look equally at home.
const body = Commissioner({ subsets: ["latin", "greek"], variable: "--font-body", display: "swap" });
const heading = GFS_Didot({
  weight: "400",
  subsets: ["latin", "greek"],
  variable: "--font-heading",
  display: "swap",
});

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
  const navLink = "border-b border-transparent pb-1 hover:border-gold";
  const footerLink = "hover:text-white hover:underline hover:decoration-gold hover:underline-offset-4";
  const footerTitle = "mb-4 text-xs font-medium tracking-[0.28em] text-gold uppercase";

  return (
    <html lang={locale} className={`${body.variable} ${heading.variable} h-full antialiased`}>
      <body className="site flex min-h-full flex-col">
        <NextIntlClientProvider>
          <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">
            {t("skipToContent")}
          </a>
          <header className="border-b border-line bg-paper">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-3 px-4 py-3 sm:px-6 md:gap-x-8">
              <Link href="/" className="shrink-0">
                <Image src={logo} alt={t("name")} priority sizes="170px" className="h-12 w-auto sm:h-14" />
              </Link>
              <nav
                aria-label={t("mainNav")}
                className="order-3 flex w-full items-center justify-center gap-x-7 text-xs font-medium tracking-[0.2em] uppercase md:order-2 md:w-auto md:flex-1 md:justify-end"
              >
                <Link href="/menu" className={navLink}>
                  {t("menu")}
                </Link>
                <Link href="/gallery" className={navLink}>
                  {t("gallery")}
                </Link>
                <Link href="/contact" className={navLink}>
                  {t("contact")}
                </Link>
              </nav>
              <div className="order-2 flex items-center gap-2 sm:gap-4 md:order-3">
                <LocaleSwitcher label={t("language")} />
                <Link href="/reserve" className="btn btn-primary px-3 py-2.5 text-[0.65rem] tracking-[0.1em] whitespace-nowrap sm:px-5 sm:text-[0.7rem] sm:tracking-[0.16em]">
                  {t("reserveCta")}
                </Link>
              </div>
            </div>
          </header>

          <div id="content" className="flex flex-1 flex-col">
            {children}
          </div>

          <footer className="bg-night text-stone-300">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 text-sm sm:grid-cols-3 sm:px-6">
              <div>
                <Image src={logoOnDark} alt={t("name")} sizes="200px" className="h-16 w-auto" />
                <address className="mt-5 leading-relaxed not-italic">
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
                <p aria-hidden className={footerTitle}>
                  {t("footerNav")}
                </p>
                <ul className="space-y-2">
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
              <div>
                <p aria-hidden className={footerTitle}>
                  {t("follow")}
                </p>
                <ul className="space-y-2">
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
            </div>
            <p className="border-t border-white/10 px-4 py-5 text-center text-xs tracking-wide text-stone-400">
              {SITE.legalName} · {t("vat", { number: SITE.vatNumber })}
            </p>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
