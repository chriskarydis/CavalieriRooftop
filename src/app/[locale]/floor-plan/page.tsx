import type { Metadata } from "next";
import { connection } from "next/server";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { localized } from "@/i18n/localized";
import { getFloorPlanView } from "@/server/floor/queries";
import { FloorPlan } from "@/ui/floor-plan/FloorPlan";

// Development preview of the seeded layout; replaced by the booking flow and the editor.
export const metadata: Metadata = { robots: { index: false } };

export default async function FloorPlanPreviewPage({ params }: PageProps<"/[locale]/floor-plan">) {
  const { locale } = await params;
  setRequestLocale(locale);
  await connection();

  const t = await getTranslations("floorPlan");
  const format = await getFormatter();
  const plan = await getFloorPlanView();
  if (!plan) return null;

  const categoryName = new Map(plan.categories.map((category) => [category.id, localized(category.name, locale)]));

  return (
    <main className="mx-auto w-full max-w-xl p-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-4 text-sm opacity-70">{t("previewNote")}</p>
      <FloorPlan
        plan={plan}
        title={t("title")}
        areaLabel={(key) => t(`areas.${key}`)}
        tableLabel={(table) =>
          t("tableLabel", {
            number: table.number,
            capacity: table.capacity,
            category: categoryName.get(table.categoryId) ?? "",
          })
        }
      />
      <h2 className="mt-6 mb-2 font-semibold">{t("legend")}</h2>
      <ul className="grid grid-cols-2 gap-2 text-sm">
        {plan.categories.map((category) => (
          <li key={category.id} className="flex items-center gap-2">
            <span aria-hidden className="inline-block size-4 rounded" style={{ background: category.color }} />
            {localized(category.name, locale)} (
            {category.extraFeeCents === 0
              ? t("noFee")
              : t("fee", {
                  amount: format.number(category.extraFeeCents / 100, {
                    style: "currency",
                    currency: "EUR",
                    maximumFractionDigits: 0,
                  }),
                })}
            )
          </li>
        ))}
      </ul>
    </main>
  );
}
