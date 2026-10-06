import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GALLERY } from "@/config/photos";
import { Link } from "@/i18n/navigation";

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
    <main className="mx-auto w-full max-w-6xl p-4 py-10">
      <header className="mb-6">
        <h1 className="font-display text-4xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-stone-700">{t("intro")}</p>
      </header>

      {/* Columns keep each photo at its own shape, upright or wide. */}
      <ul className="gap-4 sm:columns-2 lg:columns-3">
        {GALLERY.map((photo, index) => (
          <li key={photo.image.src} className="mb-4 break-inside-avoid overflow-hidden rounded-xl">
            <Image
              src={photo.image}
              alt={photo.alt[language]}
              placeholder="blur"
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              priority={index < 2}
              className="h-auto w-full"
            />
          </li>
        ))}
      </ul>

      <div className="mt-8 text-center">
        <Link href="/reserve" className="inline-block rounded-md bg-accent px-6 py-3 font-semibold text-white hover:bg-accent-dark">
          {tSite("reserveCta")}
        </Link>
      </div>
    </main>
  );
}
