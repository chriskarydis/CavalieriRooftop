import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ALLERGENS, MENU } from "@/config/initial-menu";
import * as schema from "./schema";

/**
 * Puts the allergen list and the three lists (dinner, bar, wine) from
 * src/config/initial-menu.ts into the database, replacing whatever menu is
 * there. For an empty database, tests, and bringing a development database up
 * to date; on a live site the manager edits the menu at /manage/menu instead.
 */
export async function seedInitialMenu(db: PostgresJsDatabase<typeof schema>): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.menuItemAllergen);
    await tx.delete(schema.menuItemImage);
    await tx.delete(schema.menuItem);
    await tx.delete(schema.menuCategory);

    const existing = await tx.select({ id: schema.allergen.id, code: schema.allergen.code }).from(schema.allergen);
    const missing = ALLERGENS.filter((allergen) => !existing.some((row) => row.code === allergen.code));
    const added =
      missing.length === 0
        ? []
        : await tx
            .insert(schema.allergen)
            .values(missing.map(({ code, en, el }) => ({ code, name: { en, el } })))
            .returning({ id: schema.allergen.id, code: schema.allergen.code });
    const allergenId = new Map([...existing, ...added].map((allergen) => [allergen.code, allergen.id]));

    for (const [categoryOrder, category] of MENU.entries()) {
      const [row] = await tx
        .insert(schema.menuCategory)
        .values({ menu: category.menu, name: { en: category.en, el: category.el }, displayOrder: categoryOrder })
        .returning({ id: schema.menuCategory.id });

      for (const [dishOrder, dish] of category.dishes.entries()) {
        const [item] = await tx
          .insert(schema.menuItem)
          .values({
            categoryId: row.id,
            name: { en: dish.name, el: dish.el ?? "" },
            description: { en: dish.description ?? "", el: dish.descriptionEl ?? "" },
            ingredients: { en: dish.notes ?? "", el: dish.notesEl ?? "" },
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
