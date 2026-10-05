import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { SITE } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { getOpeningSummary } from "@/server/services/opening";
import { OpeningHours } from "@/ui/OpeningHours";

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
    <main className="mx-auto w-full max-w-3xl space-y-8 p-4 py-10">
      <header>
        <h1 className="font-display text-4xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-stone-700">{t("intro")}</p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="font-display text-xl font-semibold">{t("find")}</h2>
          <address className="mt-2 leading-relaxed not-italic">
            {SITE.street}
            <br />
            {SITE.postalCode} {SITE.city[locale as "en" | "el"]}
          </address>
          <p className="mt-2 text-sm text-stone-600">{t("directions")}</p>
          <a href={SITE.mapUrl} rel="noopener" className="mt-3 inline-block underline">
            {t("openMap")}
          </a>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="font-display text-xl font-semibold">{t("reach")}</h2>
          <p className="mt-2 leading-relaxed">
            <a href={SITE.phoneHref} className="underline">
              {SITE.phone}
            </a>
            <br />
            <a href={`mailto:${SITE.email}`} className="underline">
              {SITE.email}
            </a>
          </p>
          <p className="mt-2 text-sm text-stone-600">{t("largeParties", { max: opening.maxOnlineParty })}</p>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-5 sm:col-span-2">
          <h2 className="font-display text-xl font-semibold">{t("hours")}</h2>
          <div className="mt-2 leading-relaxed">
            <OpeningHours opening={opening} />
          </div>
          <p className="mt-2 text-sm text-stone-600">{t("walkIns")}</p>
          <Link href="/reserve" className="mt-4 inline-block rounded-md bg-accent px-5 py-2.5 font-semibold text-white hover:bg-accent-dark">
            {tSite("reserveCta")}
          </Link>
        </section>
      </div>
    </main>
  );
}
