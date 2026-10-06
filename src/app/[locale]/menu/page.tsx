import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/localized";
import { db } from "@/server/db/client";
import { loadSettings } from "@/server/services/context";
import { getMenu, type MenuItemView } from "@/server/services/menu";
import { Ornament, PageHeader } from "@/ui/PageHeader";

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
  const anchor = (id: string): string => `category-${id}`;

  const renderDish = (item: MenuItemView) => {
    const description = localized(item.description, locale);
    const ingredients = localized(item.ingredients, locale);
    const tags = TAGS.filter((tag) => item[tag]);
    return (
      <li key={item.id} className={`flex gap-5 py-5 ${item.available ? "" : "opacity-60"}`}>
        {item.imageUrl && (
          // Manager-supplied address on any host, so the Next image optimiser cannot be used.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" loading="lazy" className="size-24 shrink-0 object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h3 className="text-2xl">{localized(item.name, locale)}</h3>
            {settings.showMenuPrices && item.priceCents !== null && (
              <>
                {/* A dotted leader between the dish and its price, as on a printed menu. */}
                <span aria-hidden className="min-w-6 flex-1 -translate-y-1 border-b border-dotted border-gold" />
                <span className="shrink-0 font-display text-xl tabular-nums">
                  {format.number(item.priceCents / 100, { style: "currency", currency: "EUR" })}
                </span>
              </>
            )}
          </div>
          {description && <p className="mt-1 text-muted">{description}</p>}
          {ingredients && <p className="mt-1 text-sm text-muted">{ingredients}</p>}
          {(tags.length > 0 || !item.available) && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] font-medium tracking-[0.16em] uppercase">
              {!item.available && <li className="text-muted">{t("unavailable")}</li>}
              {tags.map((tag) => (
                <li key={tag} className={tag === "signature" || tag === "chefRecommendation" ? "text-gold-deep" : "text-emerald-800"}>
                  {t(`tag.${tag}`)}
                </li>
              ))}
            </ul>
          )}
          {item.allergens.length > 0 && (
            <p className="mt-1.5 text-xs text-muted">
              {t("contains", { allergens: item.allergens.map((allergen) => localized(allergen.name, locale)).join(", ") })}
            </p>
          )}
        </div>
      </li>
    );
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader eyebrow={tSite("name")} title={t("title")} intro={t("intro")} />

      <nav aria-label={t("categories")} className="sticky top-0 z-10 -mx-4 mt-10 overflow-x-auto border-y border-line bg-ivory px-4 sm:-mx-6 sm:px-6">
        <ul className="flex gap-7 text-xs font-medium tracking-[0.18em] whitespace-nowrap uppercase sm:justify-center">
          {menu.map((category) => (
            <li key={category.id}>
              <a href={`#${anchor(category.id)}`} className="inline-block py-3.5 hover:text-gold-deep">
                {localized(category.name, locale)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {menu.map((category) => (
        <section key={category.id} id={anchor(category.id)} aria-labelledby={`${anchor(category.id)}-title`} className="scroll-mt-16 pt-14">
          <h2 id={`${anchor(category.id)}-title`} className="text-center text-4xl">
            {localized(category.name, locale)}
          </h2>
          <Ornament className="mt-4 mb-4" />
          <ul className="divide-y divide-line">
            {category.items.map(renderDish)}
          </ul>
        </section>
      ))}

      <p className="mt-14 border-t border-line pt-6 text-center text-sm text-muted">{t("allergenNote")}</p>
      <div className="mt-8 text-center">
        <Link href="/reserve" className="btn btn-primary">
          {t("reserve")}
        </Link>
      </div>
    </main>
  );
}
