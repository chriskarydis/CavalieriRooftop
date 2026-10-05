import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/server/db/schema";
import { ConfigError } from "./configuration";
import { audit, type Actor, type Db } from "./context";

/**
 * Menu: what the public menu page shows and what the manager edits. Dishes are
 * never deleted, only deactivated, so the menu's history stays intact.
 */

export type MenuCategoryRow = typeof schema.menuCategory.$inferSelect;
export type MenuItemRow = typeof schema.menuItem.$inferSelect;

export interface MenuItemView extends MenuItemRow {
  allergens: Array<{ id: string; code: string; name: Record<string, string> }>;
  imageUrl: string | null;
}

export interface MenuCategoryView extends MenuCategoryRow {
  items: MenuItemView[];
}

/** The whole menu, in display order. `publicOnly` leaves out inactive categories and dishes. */
export async function getMenu(db: Db, options: { publicOnly: boolean }): Promise<MenuCategoryView[]> {
  const [categories, items, links, allergens, images] = await Promise.all([
    db.select().from(schema.menuCategory).orderBy(asc(schema.menuCategory.displayOrder)),
    db.select().from(schema.menuItem).orderBy(asc(schema.menuItem.displayOrder), asc(schema.menuItem.createdAt)),
    db.select().from(schema.menuItemAllergen),
    db.select().from(schema.allergen),
    db.select().from(schema.menuItemImage).orderBy(asc(schema.menuItemImage.displayOrder)),
  ]);
  const allergenById = new Map(allergens.map((allergen) => [allergen.id, allergen]));

  return categories
    .filter((category) => !options.publicOnly || category.active)
    .map((category) => ({
      ...category,
      items: items
        .filter((item) => item.categoryId === category.id && (!options.publicOnly || item.active))
        .map((item) => ({
          ...item,
          allergens: links
            .filter((link) => link.menuItemId === item.id)
            .map((link) => allergenById.get(link.allergenId))
            .filter((allergen) => allergen !== undefined)
            .map(({ id, code, name }) => ({ id, code, name })),
          imageUrl: images.find((image) => image.menuItemId === item.id)?.url ?? null,
        })),
    }))
    .filter((category) => !options.publicOnly || category.items.length > 0);
}

function parse<T>(shape: z.ZodType<T>, input: unknown): T {
  const result = shape.safeParse(input);
  if (!result.success) throw new ConfigError("INVALID");
  return result.data;
}

const MAX_PRICE_CENTS = 1_000_000;
const requiredName = z.object({ en: z.string().trim().min(1).max(120), el: z.string().trim().max(120) });
const optionalText = z.object({ en: z.string().trim().max(600), el: z.string().trim().max(600) });

const categorySchema = z.object({
  name: requiredName,
  description: optionalText,
  displayOrder: z.number().int().min(0).max(1000),
  active: z.boolean(),
});

export type MenuCategoryInput = z.input<typeof categorySchema>;

export async function createMenuCategory(db: Db, input: MenuCategoryInput, actor: Actor): Promise<string> {
  const data = parse(categorySchema, input);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.menuCategory).values(data).returning({ id: schema.menuCategory.id });
    await audit(tx, { actor, action: "menu_category.created", entityType: "menu_category", entityId: row.id, after: data });
    return row.id;
  });
}

export async function updateMenuCategory(db: Db, categoryId: string, input: MenuCategoryInput, actor: Actor): Promise<void> {
  const data = parse(categorySchema, input);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(schema.menuCategory)
      .set(data)
      .where(eq(schema.menuCategory.id, categoryId))
      .returning({ id: schema.menuCategory.id });
    if (updated.length === 0) throw new ConfigError("NOT_FOUND");
    await audit(tx, { actor, action: "menu_category.updated", entityType: "menu_category", entityId: categoryId, after: data });
  });
}

const itemSchema = z.object({
  categoryId: z.string().uuid(),
  name: requiredName,
  description: optionalText,
  ingredients: optionalText,
  /** Null when the dish has no price recorded. */
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).nullable(),
  vegetarian: z.boolean(),
  vegan: z.boolean(),
  spicy: z.boolean(),
  signature: z.boolean(),
  chefRecommendation: z.boolean(),
  available: z.boolean(),
  active: z.boolean(),
  displayOrder: z.number().int().min(0).max(1000),
  allergenIds: z.array(z.string().uuid()).max(30),
  /** Address of a photo of the dish; empty for none. */
  imageUrl: z.union([z.literal(""), z.string().trim().url().max(500).startsWith("https://")]),
});

export type MenuItemInput = z.input<typeof itemSchema>;

async function writeItem(db: Db, itemId: string | null, input: MenuItemInput, actor: Actor): Promise<string> {
  const { allergenIds, imageUrl, ...data } = parse(itemSchema, input);
  return db.transaction(async (tx) => {
    const [category] = await tx.select().from(schema.menuCategory).where(eq(schema.menuCategory.id, data.categoryId));
    if (!category) throw new ConfigError("INVALID");
    if (allergenIds.length > 0) {
      const known = await tx.select().from(schema.allergen).where(inArray(schema.allergen.id, allergenIds));
      if (known.length !== new Set(allergenIds).size) throw new ConfigError("INVALID");
    }

    let id = itemId;
    if (id) {
      const updated = await tx
        .update(schema.menuItem)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.menuItem.id, id))
        .returning({ id: schema.menuItem.id });
      if (updated.length === 0) throw new ConfigError("NOT_FOUND");
    } else {
      [{ id }] = await tx.insert(schema.menuItem).values(data).returning({ id: schema.menuItem.id });
    }

    await tx.delete(schema.menuItemAllergen).where(eq(schema.menuItemAllergen.menuItemId, id));
    if (allergenIds.length > 0) {
      await tx
        .insert(schema.menuItemAllergen)
        .values([...new Set(allergenIds)].map((allergenId) => ({ menuItemId: id, allergenId })));
    }
    await tx.delete(schema.menuItemImage).where(eq(schema.menuItemImage.menuItemId, id));
    if (imageUrl) await tx.insert(schema.menuItemImage).values({ menuItemId: id, url: imageUrl });

    await audit(tx, {
      actor,
      action: itemId ? "menu_item.updated" : "menu_item.created",
      entityType: "menu_item",
      entityId: id,
      after: { ...data, allergenIds, imageUrl },
    });
    return id;
  });
}

export function createMenuItem(db: Db, input: MenuItemInput, actor: Actor): Promise<string> {
  return writeItem(db, null, input, actor);
}

export async function updateMenuItem(db: Db, itemId: string, input: MenuItemInput, actor: Actor): Promise<void> {
  await writeItem(db, itemId, input, actor);
}
