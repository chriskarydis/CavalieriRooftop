import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GALLERY } from "@/config/photos";
import { Link } from "@/i18n/navigation";
import { ZoomGallery } from "@/ui/Lightbox";
import { PageHeader } from "@/ui/PageHeader";

export async function generateMetadata({ params }: PageProps<"/[locale]/gallery">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "gallery" });
  return { title: t("title"), description: t("intro") };
}

export default async function GalleryPage({ params }: PageProps<"/[locale]/gallery">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("gallery");
  const tSite = await getTranslations("site");
  const language = locale === "el" ? "el" : "en";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader eyebrow={tSite("name")} title={t("title")} intro={t("intro")} />

      {/* Columns keep each photo at its own shape, upright or wide. */}
      <ZoomGallery
        photos={GALLERY.map((photo) => ({ image: photo.image, alt: photo.alt[language] }))}
        className="mt-12 gap-3 sm:columns-2 lg:columns-3"
        itemClassName="mb-3 break-inside-avoid"
      />

      <div className="mt-12 text-center">
        <Link href="/reserve" className="btn btn-primary">
          {tSite("reserveCta")}
        </Link>
      </div>
    </main>
  );
}
