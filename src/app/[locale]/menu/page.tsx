import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/localized";
import { db } from "@/server/db/client";
import { MENU_KEYS } from "@/server/db/schema";
import { loadSettings } from "@/server/services/context";
import { getMenu, type MenuItemView } from "@/server/services/menu";
import { PageHeader } from "@/ui/PageHeader";
import { MenuBooks, type Book, type BookItem } from "./MenuBooks";

export async function generateMetadata({ params }: PageProps<"/[locale]/menu">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "menu" });
  return { title: t("title"), description: t("intro") };
}

const TAGS = ["signature", "chefRecommendation", "vegetarian", "vegan", "spicy"] as const;

export default async function MenuPage({ params }: PageProps<"/[locale]/menu">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();
  const t = await getTranslations("menu");
  const tSite = await getTranslations("site");
  const format = await getFormatter();
  const [menu, settings] = await Promise.all([getMenu(db, { publicOnly: true }), loadSettings(db)]);

  const toItem = (item: MenuItemView): BookItem => ({
    id: item.id,
    name: localized(item.name, locale),
    description: localized(item.description, locale),
    notes: localized(item.ingredients, locale),
    price:
      settings.showMenuPrices && item.priceCents !== null
        ? format.number(item.priceCents / 100, { style: "currency", currency: "EUR" })
        : null,
    imageUrl: item.imageUrl,
    tags: [
      ...(item.available ? [] : [{ label: t("unavailable"), tone: "muted" as const }]),
      ...TAGS.filter((tag) => item[tag]).map((tag) => ({
        label: t(`tag.${tag}`),
        tone: tag === "signature" || tag === "chefRecommendation" ? ("gold" as const) : ("green" as const),
      })),
    ],
    allergens:
      item.allergens.length > 0
        ? t("contains", { allergens: item.allergens.map((allergen) => localized(allergen.name, locale)).join(", ") })
        : "",
    available: item.available,
  });

  const books: Book[] = MENU_KEYS.map((key) => ({
    key,
    title: t(`books.${key}.title`),
    text: t(`books.${key}.text`),
    sections: menu
      .filter((category) => category.menu === key)
      .map((category) => ({ id: `section-${category.id}`, name: localized(category.name, locale), items: category.items.map(toItem) })),
  })).filter((book) => book.sections.length > 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader eyebrow={tSite("name")} title={t("title")} intro={t("intro")} />

      <MenuBooks
        books={books}
        labels={{ open: t("open"), close: t("close"), sections: t("categories"), footnote: t("allergenNote") }}
      />

      <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-muted">{t("allergenNote")}</p>
      <div className="mt-8 text-center">
        <Link href="/reserve" className="btn btn-primary">
          {t("reserve")}
        </Link>
      </div>
    </main>
  );
}
