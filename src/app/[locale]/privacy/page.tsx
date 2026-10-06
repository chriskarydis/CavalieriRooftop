import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SITE } from "@/config/site";
import { PageHeader } from "@/ui/PageHeader";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return { title: t("title"), description: t("intro") };
}

const SECTIONS = ["collect", "use", "share", "keep", "cookies", "rights"] as const;

/**
 * Describes what this system actually does with guest data. The wording must
 * be reviewed by the restaurant's legal adviser before launch.
 */
export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacy");

  return (
    <main className="mx-auto w-full max-w-2xl space-y-10 px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader title={t("title")} intro={t("intro", { company: SITE.legalName })} />
      {SECTIONS.map((section) => (
        <section key={section}>
          <h2 className="text-3xl">{t(`${section}.title`)}</h2>
          <p className="mt-3 text-lg leading-relaxed text-muted">{t(`${section}.text`, { email: SITE.email })}</p>
        </section>
      ))}
    </main>
  );
}
