import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SITE } from "@/config/site";
import { PageHeader } from "@/ui/PageHeader";
import { findMyReservation } from "../reserve/actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/my-reservation">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "find" });
  return { title: t("title"), description: t("intro") };
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** For guests without their link: open a reservation with its number and the contact they booked with. */
export default async function MyReservationPage({ params, searchParams }: PageProps<"/[locale]/my-reservation">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("find");
  const tSite = await getTranslations("site");
  const error = first((await searchParams).error);

  return (
    <main className="mx-auto w-full max-w-xl space-y-8 px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader eyebrow={tSite("name")} title={t("title")} intro={t("intro")} />

      <form action={findMyReservation.bind(null, locale)} className="panel space-y-4">
        {error && (
          <p role="alert" className="notice notice-error">
            {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.NOT_FOUND")}
          </p>
        )}
        <label className="block text-sm font-medium">
          {t("reference")}
          <input name="reference" required maxLength={20} autoComplete="off" placeholder="CRG-1234" className="field" />
        </label>
        <label className="block text-sm font-medium">
          {t("contact")}
          <input name="contact" required maxLength={200} autoComplete="email" className="field" />
        </label>
        <button type="submit" className="btn btn-primary w-full">
          {t("submit")}
        </button>
        <p className="text-xs text-muted">{t("where")}</p>
      </form>

      <p className="text-center text-sm text-muted">
        {t("help")}{" "}
        <a href={SITE.phoneHref} className="text-link">
          {SITE.phone}
        </a>
      </p>
    </main>
  );
}
