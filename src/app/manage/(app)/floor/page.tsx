import { asc } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { localized } from "@/i18n/localized";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { getFloorPlanView } from "@/server/floor/queries";
import { createTableAction } from "../floor-actions";
import { cardClass, inputClass, Notice, primaryButton } from "../ui";
import { FloorEditor } from "./FloorEditor";

export default async function FloorEditorPage({ searchParams }: PageProps<"/manage/floor">) {
  await requirePermission("configuration");
  const t = await getTranslations("floorEditor");
  const tPlan = await getTranslations("floorPlan");
  const locale = await getLocale();
  const query = await searchParams;
  const [plan, categories] = await Promise.all([
    getFloorPlanView(),
    db.select().from(schema.tableCategory).orderBy(asc(schema.tableCategory.displayOrder)),
  ]);
  if (!plan) return null;

  return (
    <main className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-600">{t("intro")}</p>
      </header>
      <Notice query={query} />

      <FloorEditor
        // Remount with fresh positions after every save.
        key={plan.tables.map((table) => `${table.id}:${table.x}:${table.y}:${table.width}:${table.height}:${table.rotation}:${table.shape}`).join("|")}
        plan={{ width: plan.width, height: plan.height, shapes: plan.shapes }}
        initial={plan.tables.map((table) => ({
          id: table.id,
          number: table.number,
          isSpare: table.isSpare,
          capacity: table.capacity,
          maxCapacity: table.maxCapacity,
          active: !table.muted,
          color: table.color,
          x: table.x,
          y: table.y,
          width: table.width,
          height: table.height,
          rotation: table.rotation,
          shape: table.shape,
        }))}
        areaLabels={{
          toilets: tPlan("areas.toilets"),
          entrance: tPlan("areas.entrance"),
          kitchen: tPlan("areas.kitchen"),
          bar: tPlan("areas.bar"),
          viewTop: tPlan("areas.viewTop"),
          viewBottom: tPlan("areas.viewBottom"),
          viewLeft: tPlan("areas.viewLeft"),
          viewRight: tPlan("areas.viewRight"),
        }}
      />

      <section className={cardClass}>
        <h2 className="font-semibold">{t("newTable")}</h2>
        <p className="mb-3 text-sm text-slate-600">{t("newTableNote")}</p>
        <form action={createTableAction} className="flex flex-wrap items-end gap-3 text-sm font-medium">
          <label>
            {t("number")}
            <input name="number" type="number" min={1} max={999} required className={inputClass} />
          </label>
          <label>
            {t("capacity")}
            <input name="capacity" type="number" min={1} max={30} required defaultValue={2} className={inputClass} />
          </label>
          <label>
            {t("category")}
            <select name="categoryId" className={inputClass}>
              {categories
                .filter((category) => category.active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {localized(category.name, locale)}
                  </option>
                ))}
            </select>
          </label>
          <button type="submit" className={primaryButton}>
            {t("addTable")}
          </button>
        </form>
      </section>
    </main>
  );
}
