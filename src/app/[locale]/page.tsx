import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { SITE, siteUrl } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { db } from "@/server/db/client";
import { getOpeningSummary } from "@/server/services/opening";
import { OpeningHours } from "@/ui/OpeningHours";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return {
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(routing.locales.map((entry) => [entry, `/${entry}`])),
    },
  };
}

const FEATURES = ["view", "cuisine", "table"] as const;

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();
  const t = await getTranslations("home");
  const tSite = await getTranslations("site");
  const opening = await getOpeningSummary(db);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: SITE.name,
    url: `${siteUrl()}/${locale}`,
    telephone: SITE.phone,
    email: SITE.email,
    servesCuisine: "Mediterranean",
    acceptsReservations: `${siteUrl()}/${locale}/reserve`,
    menu: `${siteUrl()}/${locale}/menu`,
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE.street,
      postalCode: SITE.postalCode,
      addressLocality: SITE.city.en,
      addressCountry: SITE.country,
    },
    sameAs: Object.values(SITE.social),
  };

  return (
    <main>
      <script
        type="application/ld+json"
        // Built from constants above, with "<" escaped so it cannot close the script element.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />

      <section className="hero-sunset text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-6xl flex-col justify-end px-4 pt-24 pb-14">
          <p className="text-sm font-medium tracking-[0.2em] uppercase">{t("eyebrow")}</p>
          <h1 className="mt-3 max-w-3xl font-display text-5xl leading-tight font-semibold sm:text-6xl">{t("title")}</h1>
          <p className="mt-4 max-w-xl text-lg text-white/90">{t("lead")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/reserve" className="rounded-md bg-white px-6 py-3 font-semibold text-sea hover:bg-stone-100">
              {t("chooseTable")}
            </Link>
            <Link href="/menu" className="rounded-md border border-white/70 px-6 py-3 font-semibold hover:bg-white/10">
              {tSite("menu")}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <article key={feature}>
            <h2 className="font-display text-2xl font-semibold">{t(`${feature}.title`)}</h2>
            <p className="mt-2 leading-relaxed text-stone-700">{t(`${feature}.text`)}</p>
          </article>
        ))}
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-semibold">{t("bookTitle")}</h2>
            <p className="mt-3 leading-relaxed text-stone-700">{t("bookText")}</p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-stone-700">
              <li>{t("bookPoint1")}</li>
              <li>{t("bookPoint2", { hours: opening.refundCutoffHours })}</li>
              <li>{t("bookPoint3")}</li>
            </ul>
            <Link href="/reserve" className="mt-6 inline-block rounded-md bg-accent px-6 py-3 font-semibold text-white hover:bg-accent-dark">
              {tSite("reserveCta")}
            </Link>
          </div>
          <div className="rounded-xl bg-sand p-6">
            <h2 className="font-display text-2xl font-semibold">{t("visitTitle")}</h2>
            <div className="mt-3 space-y-3 leading-relaxed text-stone-800">
              <OpeningHours opening={opening} />
              <p>
                {SITE.street}, {SITE.city[locale as "en" | "el"]}
                <br />
                <a href={SITE.phoneHref} className="underline">
                  {SITE.phone}
                </a>
              </p>
              <p className="text-sm text-stone-600">{t("walkIns")}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
