import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { PHOTOS } from "@/config/photos";
import { SITE } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { getOpeningSummary } from "@/server/services/opening";
import { LocationMap } from "@/ui/LocationMap";
import { OpeningHours } from "@/ui/OpeningHours";
import { PageHeader } from "@/ui/PageHeader";

export async function generateMetadata({ params }: PageProps<"/[locale]/contact">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return { title: t("title"), description: t("intro") };
}

export default async function ContactPage({ params }: PageProps<"/[locale]/contact">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();
  const t = await getTranslations("contact");
  const tSite = await getTranslations("site");
  const opening = await getOpeningSummary(db);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader eyebrow={tSite("name")} title={t("title")} intro={t("intro")} />

      <div className="mt-14 grid gap-12 border-y border-line py-12 text-center md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
        <section className="md:px-8">
          <h2 className="text-3xl">{t("find")}</h2>
          <address className="mt-4 text-lg leading-relaxed not-italic">
            {SITE.street}
            <br />
            {SITE.postalCode} {SITE.city[locale as "en" | "el"]}
          </address>
          <p className="mt-3 text-sm text-muted">{t("directions")}</p>
          <a href={SITE.mapUrl} rel="noopener" className="text-link mt-4 inline-block text-xs font-medium tracking-[0.2em] uppercase">
            {t("openMap")}
          </a>
        </section>

        <section className="md:px-8">
          <h2 className="text-3xl">{t("hours")}</h2>
          <div className="mt-4 text-lg leading-relaxed">
            <OpeningHours opening={opening} />
          </div>
          <p className="mt-3 text-sm text-muted">{t("walkIns")}</p>
        </section>

        <section className="md:px-8">
          <h2 className="text-3xl">{t("reach")}</h2>
          <p className="mt-4 text-lg leading-relaxed">
            <a href={SITE.phoneHref} className="text-link">
              {SITE.phone}
            </a>
            <br />
            <a href={`mailto:${SITE.email}`} className="text-link break-words">
              {SITE.email}
            </a>
          </p>
          <p className="mt-3 text-sm text-muted">{t("largeParties", { max: opening.maxOnlineParty })}</p>
        </section>
      </div>

      <section className="mt-16 grid gap-10 md:grid-cols-[3fr_2fr] md:items-start">
        <LocationMap src={SITE.mapEmbedUrl} title={t("mapTitle")} showLabel={t("showMap")} note={t("mapNote")} />
        <div>
          <h2 className="text-3xl">{t("gettingHere")}</h2>
          <div aria-hidden className="mt-4 h-px w-16 bg-gold" />
          <Image
            src={PHOTOS.terraceEntrance.image}
            alt={PHOTOS.terraceEntrance.alt[locale === "el" ? "el" : "en"]}
            placeholder="blur"
            sizes="(min-width: 768px) 40vw, 100vw"
            className="mt-5 aspect-[4/3] w-full object-cover"
          />
          <p className="mt-4 leading-relaxed text-muted">{t("gettingHereText")}</p>
          <a href={SITE.directionsUrl} target="_blank" rel="noopener" className="btn btn-primary mt-5">
            {t("directions2")}
          </a>

          <h3 className="mt-10 text-2xl">{t("parkingTitle")}</h3>
          <p className="mt-2 text-sm text-muted">{t("parkingText")}</p>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {SITE.parking.map((park) => (
              <li key={park.directionsUrl} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <span>
                  {park.name[locale as "en" | "el"] ?? park.name.en}
                  <span className="block text-sm text-muted">{park.note[locale as "en" | "el"] ?? park.note.en}</span>
                </span>
                <a href={park.directionsUrl} target="_blank" rel="noopener" className="text-link text-xs font-medium tracking-[0.2em] uppercase">
                  {t("directions2")}
                </a>
              </li>
            ))}
          </ul>
          <a href={SITE.parkingSearchUrl} target="_blank" rel="noopener" className="text-link mt-4 inline-block text-sm">
            {t("parkingAll")}
          </a>
        </div>
      </section>

      <div className="mt-16 text-center">
        <Link href="/reserve" className="btn btn-primary">
          {tSite("reserveCta")}
        </Link>
      </div>
    </main>
  );
}
