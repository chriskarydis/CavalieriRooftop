import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("errorPage");
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 p-6">
      <h1 className="text-4xl">{t("notFoundTitle")}</h1>
      <p className="text-muted">{t("notFoundText")}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">
          {t("home")}
        </Link>
        <Link href="/reserve" className="btn btn-outline">
          {t("reserve")}
        </Link>
      </div>
    </main>
  );
}
