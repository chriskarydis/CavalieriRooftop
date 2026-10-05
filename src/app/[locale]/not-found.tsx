import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("errorPage");
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 p-6">
      <h1 className="font-display text-3xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-stone-700">{t("notFoundText")}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="rounded-md bg-accent px-5 py-3 font-semibold text-white hover:bg-accent-dark">
          {t("home")}
        </Link>
        <Link href="/reserve" className="rounded-md border border-stone-400 px-5 py-3 font-semibold hover:bg-stone-100">
          {t("reserve")}
        </Link>
      </div>
    </main>
  );
}
