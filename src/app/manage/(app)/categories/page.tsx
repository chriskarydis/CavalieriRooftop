import { asc, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { localized } from "@/i18n/localized";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { addCategory, saveCategory } from "../config-actions";
import { cardClass, inputClass, Notice, primaryButton } from "../ui";

const CENTS = 100;
const DEFAULT_COLOR = "#8FA3AD";

type Category = typeof schema.tableCategory.$inferSelect;

async function CategoryFields({ category }: { category?: Category }) {
  const t = await getTranslations("config");
  return (
    <>
      <label>
        {t("categories.nameEn")}
        <input name="nameEn" required maxLength={60} defaultValue={category?.name.en ?? ""} className={inputClass} />
      </label>
      <label>
        {t("categories.nameEl")}
        <input name="nameEl" required maxLength={60} defaultValue={category?.name.el ?? ""} className={inputClass} />
      </label>
      <label>
        {t("categories.fee")}
        <input
          name="fee"
          type="number"
          min={0}
          max={1000}
          step="0.01"
          required
          defaultValue={(category?.extraFeeCents ?? 0) / CENTS}
          className={inputClass}
        />
      </label>
      <label>
        {t("categories.color")}
        <input name="color" type="color" defaultValue={category?.color ?? DEFAULT_COLOR} className={`${inputClass} h-9 p-1`} />
      </label>
      <label className="sm:col-span-2">
        {t("categories.descriptionEn")}
        <input name="descriptionEn" maxLength={300} defaultValue={category?.description?.en ?? ""} className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        {t("categories.descriptionEl")}
        <input name="descriptionEl" maxLength={300} defaultValue={category?.description?.el ?? ""} className={inputClass} />
      </label>
      <label>
        {t("categories.priority")}
        <input name="priority" type="number" min={-100} max={100} required defaultValue={category?.priority ?? 0} className={inputClass} />
      </label>
      <label>
        {t("categories.displayOrder")}
        <input name="displayOrder" type="number" min={0} max={1000} required defaultValue={category?.displayOrder ?? 0} className={inputClass} />
      </label>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input name="feeCountsTowardMinSpend" type="checkbox" defaultChecked={category?.feeCountsTowardMinSpend ?? false} />
        {t("categories.feeCounts")}
      </label>
    </>
  );
}

export default async function CategoriesPage({ searchParams }: PageProps<"/manage/categories">) {
  await requirePermission("configuration");
  const t = await getTranslations("config");
  const locale = await getLocale();
  const query = await searchParams;
  const [categories, usage] = await Promise.all([
    db.select().from(schema.tableCategory).orderBy(asc(schema.tableCategory.displayOrder)),
    db
      .select({ categoryId: schema.diningTable.categoryId, count: sql<number>`count(*)::int` })
      .from(schema.diningTable)
      .groupBy(schema.diningTable.categoryId),
  ]);
  const tablesIn = new Map(usage.map((row) => [row.categoryId, row.count]));
  const formClass = "grid gap-3 text-sm font-medium sm:grid-cols-4";

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-lg font-semibold">{t("categories.title")}</h1>
        <p className="text-sm text-slate-600">{t("categories.intro")}</p>
      </header>
      <Notice query={query} />

      {categories.map((category) => (
        <section key={category.id} className={cardClass}>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <span aria-hidden className="inline-block size-4 rounded" style={{ background: category.color }} />
            {localized(category.name, locale)}
            <span className="text-sm font-normal text-slate-600">
              {t("categories.tableCount", { count: tablesIn.get(category.id) ?? 0 })}
            </span>
          </h2>
          <form action={saveCategory.bind(null, category.id)} className={formClass}>
            <CategoryFields category={category} />
            <label className="flex items-center gap-2 sm:col-span-2">
              <input name="active" type="checkbox" defaultChecked={category.active} />
              {t("categories.active")}
            </label>
            <div className="sm:col-span-4">
              <button type="submit" className={primaryButton}>
                {t("save")}
              </button>
            </div>
          </form>
        </section>
      ))}

      <section className={cardClass}>
        <h2 className="mb-3 font-semibold">{t("categories.new")}</h2>
        <form action={addCategory} className={formClass}>
          <CategoryFields />
          <div className="sm:col-span-4">
            <button type="submit" className={primaryButton}>
              {t("categories.create")}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
