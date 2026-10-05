import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/localized";
import { db } from "@/server/db/client";
import { loadSettings } from "@/server/services/context";
import { getMenu, type MenuItemView } from "@/server/services/menu";

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
  const format = await getFormatter();
  const [menu, settings] = await Promise.all([getMenu(db, { publicOnly: true }), loadSettings(db)]);
  const anchor = (id: string): string => `category-${id}`;

  const renderDish = (item: MenuItemView) => {
    const description = localized(item.description, locale);
    const ingredients = localized(item.ingredients, locale);
    const tags = TAGS.filter((tag) => item[tag]);
    return (
      <li key={item.id} className={`flex gap-4 py-4 ${item.available ? "" : "opacity-60"}`}>
        {item.imageUrl && (
          // Manager-supplied address on any host, so the Next image optimiser cannot be used.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" loading="lazy" className="size-24 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-lg font-medium">{localized(item.name, locale)}</h3>
            {settings.showMenuPrices && item.priceCents !== null && (
              <span className="shrink-0 tabular-nums">
                {format.number(item.priceCents / 100, { style: "currency", currency: "EUR" })}
              </span>
            )}
          </div>
          {description && <p className="text-stone-700">{description}</p>}
          {ingredients && <p className="text-sm text-stone-600">{ingredients}</p>}
          {(tags.length > 0 || !item.available) && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
              {!item.available && <li className="rounded-full bg-stone-200 px-2 py-0.5">{t("unavailable")}</li>}
              {tags.map((tag) => (
                <li
                  key={tag}
                  className={`rounded-full px-2 py-0.5 ${
                    tag === "signature" || tag === "chefRecommendation"
                      ? "bg-amber-100 text-amber-900"
                      : "bg-emerald-100 text-emerald-900"
                  }`}
                >
                  {t(`tag.${tag}`)}
                </li>
              ))}
            </ul>
          )}
          {item.allergens.length > 0 && (
            <p className="mt-1 text-xs text-stone-600">
              {t("contains", { allergens: item.allergens.map((allergen) => localized(allergen.name, locale)).join(", ") })}
            </p>
          )}
        </div>
      </li>
    );
  };

  return (
    <main className="mx-auto w-full max-w-3xl p-4 pb-16">
      <header className="mb-4">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-stone-700">{t("intro")}</p>
      </header>

      <nav aria-label={t("categories")} className="sticky top-0 z-10 -mx-4 mb-4 overflow-x-auto border-b border-stone-200 bg-background px-4 py-2">
        <ul className="flex gap-2 whitespace-nowrap text-sm">
          {menu.map((category) => (
            <li key={category.id}>
              <a href={`#${anchor(category.id)}`} className="inline-block rounded-full border border-stone-300 bg-white px-3 py-1.5">
                {localized(category.name, locale)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {menu.map((category) => (
        <section key={category.id} id={anchor(category.id)} aria-labelledby={`${anchor(category.id)}-title`} className="scroll-mt-16 pt-4">
          <h2 id={`${anchor(category.id)}-title`} className="text-2xl font-semibold">
            {localized(category.name, locale)}
          </h2>
          <ul className="divide-y divide-stone-200">
            {category.items.map(renderDish)}
          </ul>
        </section>
      ))}

      <p className="mt-8 text-sm text-stone-600">{t("allergenNote")}</p>
      <div className="mt-6 text-center">
        <Link href="/reserve" className="inline-block rounded-md bg-stone-900 px-5 py-3 font-medium text-white">
          {t("reserve")}
        </Link>
      </div>
    </main>
  );
}
