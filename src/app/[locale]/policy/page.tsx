import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { SITE } from "@/config/site";
import { PageHeader } from "@/ui/PageHeader";
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
    <main className="mx-auto w-full max-w-2xl space-y-10 px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader title={t("title")} intro={t("intro")} />
      {SECTIONS.map((section) => (
        <section key={section}>
          <h2 className="text-3xl">{t(`${section}.title`)}</h2>
          <p className="mt-3 text-lg leading-relaxed text-muted">{t(`${section}.text`, values)}</p>
        </section>
      ))}
      <footer className="border-t border-line pt-5 text-sm text-muted">
        {SITE.legalName} · {SITE.street}, {SITE.postalCode} {SITE.city.en} · {SITE.phone} · {SITE.email}
      </footer>
    </main>
  );
}
