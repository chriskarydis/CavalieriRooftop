import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { SITE } from "@/config/site";
import { db } from "@/server/db/client";
import { getOpeningSummary } from "@/server/services/opening";

export async function generateMetadata({ params }: PageProps<"/[locale]/policy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "policy" });
  return { title: t("title"), description: t("intro") };
}

const SECTIONS = ["reservations", "deposit", "tables", "arrival", "cancellation", "payment"] as const;

/** The reservation policy, stated from the live settings so the page can never disagree with the system. */
export default async function PolicyPage({ params }: PageProps<"/[locale]/policy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();
  const t = await getTranslations("policy");
  const format = await getFormatter();
  const opening = await getOpeningSummary(db);
  const values = {
    deposit: format.number(opening.depositPerPersonCents / 100, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }),
    minutes: opening.graceMinutes,
    hours: opening.refundCutoffHours,
    max: opening.maxOnlineParty,
  };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 py-10">
      <header>
        <h1 className="font-display text-4xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-stone-700">{t("intro")}</p>
      </header>
      {SECTIONS.map((section) => (
        <section key={section}>
          <h2 className="font-display text-2xl font-semibold">{t(`${section}.title`)}</h2>
          <p className="mt-2 leading-relaxed text-stone-800">{t(`${section}.text`, values)}</p>
        </section>
      ))}
      <footer className="border-t border-stone-200 pt-4 text-sm text-stone-600">
        {SITE.legalName} · {SITE.street}, {SITE.postalCode} {SITE.city.en} · {SITE.phone} · {SITE.email}
      </footer>
    </main>
  );
}
