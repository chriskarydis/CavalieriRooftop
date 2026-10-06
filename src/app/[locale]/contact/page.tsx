import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { SITE } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { getOpeningSummary } from "@/server/services/opening";
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

      <div className="mt-12 text-center">
        <Link href="/reserve" className="btn btn-primary">
          {tSite("reserveCta")}
        </Link>
      </div>
    </main>
  );
}
