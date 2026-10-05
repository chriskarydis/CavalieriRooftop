import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ALLERGENS, MENU } from "@/config/initial-menu";
import * as schema from "./schema";

/** Inserts the allergen list and the initial menu. Call only on an empty menu. */
export async function seedInitialMenu(db: PostgresJsDatabase<typeof schema>): Promise<void> {
  await db.transaction(async (tx) => {
    const allergens = await tx
      .insert(schema.allergen)
      .values(ALLERGENS.map(({ code, en, el }) => ({ code, name: { en, el } })))
      .returning({ id: schema.allergen.id, code: schema.allergen.code });
    const allergenId = new Map(allergens.map((allergen) => [allergen.code, allergen.id]));

    for (const [categoryOrder, category] of MENU.entries()) {
      const [row] = await tx
        .insert(schema.menuCategory)
        .values({ name: { en: category.en, el: category.el }, displayOrder: categoryOrder })
        .returning({ id: schema.menuCategory.id });

      for (const [dishOrder, dish] of category.dishes.entries()) {
        const [item] = await tx
          .insert(schema.menuItem)
          .values({
            categoryId: row.id,
            name: { en: dish.name, el: "" },
            description: { en: dish.description ?? "", el: "" },
            vegetarian: dish.vegetarian ?? false,
            displayOrder: dishOrder,
          })
          .returning({ id: schema.menuItem.id });
        if (dish.allergens?.length) {
          await tx
            .insert(schema.menuItemAllergen)
            .values(dish.allergens.map((code) => ({ menuItemId: item.id, allergenId: allergenId.get(code)! })));
        }
      }
    }
  });
}
