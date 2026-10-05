import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SITE } from "@/config/site";

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
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 py-10">
      <header>
        <h1 className="font-display text-4xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-stone-700">{t("intro", { company: SITE.legalName })}</p>
      </header>
      {SECTIONS.map((section) => (
        <section key={section}>
          <h2 className="font-display text-2xl font-semibold">{t(`${section}.title`)}</h2>
          <p className="mt-2 leading-relaxed text-stone-800">{t(`${section}.text`, { email: SITE.email })}</p>
        </section>
      ))}
    </main>
  );
}
