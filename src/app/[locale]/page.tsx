import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("site");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-semibold">{t("name")}</h1>
      <p className="text-lg">{t("tagline")}</p>
      <p className="text-sm opacity-70">{t("underConstruction")}</p>
    </main>
  );
}
