import type { Metadata } from "next";
import Image, { getImageProps } from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { GALLERY, PHOTOS } from "@/config/photos";
import { SITE, siteUrl } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { db } from "@/server/db/client";
import { getOpeningSummary } from "@/server/services/opening";
import { OpeningHours } from "@/ui/OpeningHours";
import { Ornament } from "@/ui/PageHeader";

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
const FEATURE_PHOTO = { view: PHOTOS.fortressDay, cuisine: PHOTOS.pasta, table: PHOTOS.terraceSunset } as const;
const FEATURE_LINK = { view: "/gallery", cuisine: "/menu", table: "/reserve" } as const;

// Photos for the strip at the foot of the page: ones not already shown above.
const SHOWN = new Set<unknown>([PHOTOS.heroWide, PHOTOS.heroTall, PHOTOS.fortressNight, ...Object.values(FEATURE_PHOTO)].map((photo) => photo.image));
const STRIP = GALLERY.filter((photo) => !SHOWN.has(photo.image)).slice(0, 4);

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();
  const t = await getTranslations("home");
  const tSite = await getTranslations("site");
  const opening = await getOpeningSummary(db);
  const language = locale === "el" ? "el" : "en";

  const { props: heroWide } = getImageProps({ src: PHOTOS.heroWide.image, alt: "", sizes: "100vw" });
  const { props: heroTall } = getImageProps({
    src: PHOTOS.heroTall.image,
    alt: PHOTOS.heroWide.alt[language],
    sizes: "100vw",
    priority: true,
  });

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

      <section className="relative isolate overflow-hidden bg-night text-white">
        {/* A wide photograph on larger screens, an upright one on phones. */}
        <picture>
          <source media="(min-width: 768px)" srcSet={heroWide.srcSet} sizes="100vw" />
          {/* eslint-disable-next-line jsx-a11y/alt-text -- props, including alt, come from getImageProps */}
          <img
            {...heroTall}
            fetchPriority="high"
            className="absolute inset-0 -z-20 size-full object-cover"
          />
        </picture>
        {/* Darkens the photo evenly so the white text stays readable on any picture. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/45 via-black/35 to-black/70" />
        <div className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-4xl flex-col items-center justify-center px-4 py-20 text-center">
          <p className="text-xs font-medium tracking-[0.32em] uppercase">{t("eyebrow")}</p>
          <h1 className="mt-6 text-5xl text-balance sm:text-7xl">{t("title")}</h1>
          <div aria-hidden className="ornament mt-8 [&::after]:bg-white/60 [&::before]:bg-white/60">
            <span className="bg-white" />
          </div>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/90">{t("lead")}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link href="/reserve" className="btn btn-solid-light">
              {t("chooseTable")}
            </Link>
            <Link href="/menu" className="btn btn-light">
              {tSite("menu")}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-16 px-4 py-20 sm:px-6 md:space-y-24 md:py-28">
        {FEATURES.map((feature, index) => (
          <article key={feature} className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
            <Image
              src={FEATURE_PHOTO[feature].image}
              alt={FEATURE_PHOTO[feature].alt[language]}
              placeholder="blur"
              sizes="(min-width: 768px) 50vw, 100vw"
              className={`aspect-[4/3] w-full object-cover ${index % 2 === 1 ? "md:order-2" : ""}`}
            />
            <div className="md:px-6">
              <h2 className="text-4xl sm:text-5xl">{t(`${feature}.title`)}</h2>
              <div aria-hidden className="mt-5 h-px w-16 bg-gold" />
              <p className="mt-5 text-lg leading-relaxed text-muted">{t(`${feature}.text`)}</p>
              <Link href={FEATURE_LINK[feature]} className="text-link mt-6 inline-block text-xs font-medium tracking-[0.2em] uppercase">
                {feature === "view" ? t("galleryLink") : feature === "cuisine" ? tSite("menu") : t("chooseTable")}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="bg-night text-stone-200">
        <div className="mx-auto grid max-w-6xl md:grid-cols-2">
          <Image
            src={PHOTOS.fortressNight.image}
            alt={PHOTOS.fortressNight.alt[language]}
            placeholder="blur"
            sizes="(min-width: 768px) 50vw, 100vw"
            className="size-full max-h-[34rem] object-cover object-[50%_60%]"
          />
          <div className="px-4 py-14 sm:px-10 md:py-20">
            <h2 className="text-4xl text-white sm:text-5xl">{t("bookTitle")}</h2>
            <div aria-hidden className="mt-5 h-px w-16 bg-gold" />
            <p className="mt-5 text-lg leading-relaxed">{t("bookText")}</p>
            <ul className="mt-6 divide-y divide-white/15 border-y border-white/15">
              <li className="py-3">{t("bookPoint1")}</li>
              <li className="py-3">{t("bookPoint2", { hours: opening.refundCutoffHours })}</li>
              <li className="py-3">{t("bookPoint3")}</li>
            </ul>
            <Link href="/reserve" className="btn btn-solid-light mt-8">
              {tSite("reserveCta")}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-4xl sm:text-5xl">{t("visitTitle")}</h2>
        <Ornament className="mt-6" />
        <div className="mt-8 space-y-4 text-lg leading-relaxed">
          <OpeningHours opening={opening} />
          <p>
            {SITE.street}, {SITE.city[locale as "en" | "el"]}
            <br />
            <a href={SITE.phoneHref} className="text-link">
              {SITE.phone}
            </a>
          </p>
          <p className="text-base text-muted">{t("walkIns")}</p>
        </div>
      </section>

      <section className="border-t border-line bg-paper py-20 text-center">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-4xl sm:text-5xl">{t("galleryTitle")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted">{t("galleryText")}</p>
          <ul className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
            {STRIP.map((photo) => (
              <li key={photo.image.src}>
                <Image
                  src={photo.image}
                  alt={photo.alt[language]}
                  placeholder="blur"
                  sizes="(min-width: 768px) 25vw, 50vw"
                  className="aspect-[3/4] w-full object-cover"
                />
              </li>
            ))}
          </ul>
          <Link href="/gallery" className="btn btn-outline mt-10">
            {t("galleryLink")}
          </Link>
        </div>
      </section>
    </main>
  );
}
