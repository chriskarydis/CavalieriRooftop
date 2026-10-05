import { asc } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { localized } from "@/i18n/localized";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { getMenu, type MenuCategoryView, type MenuItemView } from "@/server/services/menu";
import { cardClass, inputClass, Notice, primaryButton } from "../ui";
import { addMenuCategory, addMenuItem, saveMenuCategory, saveMenuItem } from "./actions";

const CENTS = 100;
const FLAGS = ["vegetarian", "vegan", "spicy", "signature", "chefRecommendation"] as const;

type Allergen = typeof schema.allergen.$inferSelect;

async function ItemFields({
  item,
  categories,
  allergens,
  categoryId,
}: {
  item?: MenuItemView;
  categories: MenuCategoryView[];
  allergens: Allergen[];
  categoryId: string;
}) {
  const t = await getTranslations("menuAdmin");
  const locale = await getLocale();
  const selected = new Set(item?.allergens.map((allergen) => allergen.id));

  return (
    <>
      <label className="sm:col-span-2">
        {t("nameEn")}
        <input name="nameEn" required maxLength={120} defaultValue={item?.name.en ?? ""} className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        {t("nameEl")}
        <input name="nameEl" maxLength={120} defaultValue={item?.name.el ?? ""} className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        {t("descriptionEn")}
        <textarea name="descriptionEn" maxLength={600} rows={2} defaultValue={item?.description?.en ?? ""} className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        {t("descriptionEl")}
        <textarea name="descriptionEl" maxLength={600} rows={2} defaultValue={item?.description?.el ?? ""} className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        {t("ingredientsEn")}
        <input name="ingredientsEn" maxLength={600} defaultValue={item?.ingredients?.en ?? ""} className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        {t("ingredientsEl")}
        <input name="ingredientsEl" maxLength={600} defaultValue={item?.ingredients?.el ?? ""} className={inputClass} />
      </label>
      <label>
        {t("category")}
        <select name="categoryId" defaultValue={item?.categoryId ?? categoryId} className={inputClass}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {localized(category.name, locale)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("price")}
        <input
          name="price"
          type="number"
          min={0}
          max={10000}
          step="0.01"
          defaultValue={item?.priceCents == null ? "" : item.priceCents / CENTS}
          className={inputClass}
        />
      </label>
      <label>
        {t("displayOrder")}
        <input name="displayOrder" type="number" min={0} max={1000} required defaultValue={item?.displayOrder ?? 0} className={inputClass} />
      </label>
      <fieldset className="sm:col-span-4">
        <legend>{t("tags")}</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-normal">
          {FLAGS.map((flag) => (
            <label key={flag} className="flex items-center gap-1.5">
              <input type="checkbox" name={flag} defaultChecked={item?.[flag] ?? false} />
              {t(`flag.${flag}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="sm:col-span-4">
        <legend>{t("allergens")}</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-normal">
          {allergens.map((allergen) => (
            <label key={allergen.id} className="flex items-center gap-1.5">
              <input type="checkbox" name="allergenIds" value={allergen.id} defaultChecked={selected.has(allergen.id)} />
              {localized(allergen.name, locale)}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export default async function MenuAdminPage({ searchParams }: PageProps<"/manage/menu">) {
  await requirePermission("configuration");
  const t = await getTranslations("menuAdmin");
  const tConfig = await getTranslations("config");
  const locale = await getLocale();
  const query = await searchParams;
  const [menu, allergens] = await Promise.all([
    getMenu(db, { publicOnly: false }),
    db.select().from(schema.allergen).orderBy(asc(schema.allergen.code)),
  ]);
  const formClass = "mt-3 grid gap-3 text-sm font-medium sm:grid-cols-4";

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-600">{t("intro")}</p>
      </header>
      <Notice query={query} />

      {menu.map((category) => (
        <section key={category.id} className={cardClass}>
          <details>
            <summary className="cursor-pointer text-base font-semibold">
              {localized(category.name, locale)}
              <span className="ml-2 text-sm font-normal text-slate-600">
                {t("dishCount", { count: category.items.length })}
                {!category.active && ` · ${t("hidden")}`}
              </span>
            </summary>
            <form action={saveMenuCategory.bind(null, category.id)} className={formClass}>
              <label>
                {t("nameEn")}
                <input name="nameEn" required maxLength={120} defaultValue={category.name.en} className={inputClass} />
              </label>
              <label>
                {t("nameEl")}
                <input name="nameEl" maxLength={120} defaultValue={category.name.el ?? ""} className={inputClass} />
              </label>
              <label>
                {t("displayOrder")}
                <input name="displayOrder" type="number" min={0} max={1000} required defaultValue={category.displayOrder} className={inputClass} />
              </label>
              <label className="flex items-center gap-2 pt-6">
                <input name="active" type="checkbox" defaultChecked={category.active} />
                {t("categoryActive")}
              </label>
              <input type="hidden" name="descriptionEn" value={category.description?.en ?? ""} />
              <input type="hidden" name="descriptionEl" value={category.description?.el ?? ""} />
              <div className="sm:col-span-4">
                <button type="submit" className={primaryButton}>
                  {tConfig("save")}
                </button>
              </div>
            </form>
          </details>

          <ul className="mt-3 divide-y divide-slate-100">
            {category.items.map((item) => (
              <li key={item.id} className="py-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3">
                    <span className={item.active ? "" : "text-slate-500 line-through"}>{localized(item.name, locale)}</span>
                    {!item.name.el && <span className="text-xs text-amber-700">{t("noGreek")}</span>}
                    {item.active && !item.available && <span className="text-xs text-red-700">{t("unavailable")}</span>}
                  </summary>
                  <form action={saveMenuItem.bind(null, item.id)} className={formClass}>
                    <ItemFields item={item} categories={menu} allergens={allergens} categoryId={category.id} />
                    <label className="flex items-center gap-2 sm:col-span-2">
                      <input name="available" type="checkbox" defaultChecked={item.available} />
                      {t("available")}
                    </label>
                    <label className="flex items-center gap-2 sm:col-span-2">
                      <input name="active" type="checkbox" defaultChecked={item.active} />
                      {t("onMenu")}
                    </label>
                    <div className="sm:col-span-4">
                      <button type="submit" className={primaryButton}>
                        {tConfig("save")}
                      </button>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>

          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">{t("addDish")}</summary>
            <form action={addMenuItem} className={formClass}>
              <ItemFields categories={menu} allergens={allergens} categoryId={category.id} />
              <div className="sm:col-span-4">
                <button type="submit" className={primaryButton}>
                  {t("createDish")}
                </button>
              </div>
            </form>
          </details>
        </section>
      ))}

      <section className={cardClass}>
        <h2 className="font-semibold">{t("newCategory")}</h2>
        <form action={addMenuCategory} className={formClass}>
          <label>
            {t("nameEn")}
            <input name="nameEn" required maxLength={120} className={inputClass} />
          </label>
          <label>
            {t("nameEl")}
            <input name="nameEl" maxLength={120} className={inputClass} />
          </label>
          <label>
            {t("displayOrder")}
            <input name="displayOrder" type="number" min={0} max={1000} required defaultValue={menu.length} className={inputClass} />
          </label>
          <div className="pt-6">
            <button type="submit" className={primaryButton}>
              {t("createCategory")}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
