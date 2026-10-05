import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MENU } from "@/config/initial-menu";
import * as schema from "@/server/db/schema";
import { seedInitialMenu } from "@/server/db/seed-menu";
import { ConfigError } from "@/server/services/configuration";
import { createMenuCategory, createMenuItem, getMenu, updateMenuItem, type MenuItemInput } from "@/server/services/menu";
import { openTestDatabase, resetTestDatabase } from "./test-db";

const MANAGER = "manager-1";

describe("menu", () => {
  let ctx: Awaited<ReturnType<typeof openTestDatabase>>;

  const dish = async (name: string) => {
    const menu = await getMenu(ctx.db, { publicOnly: false });
    const found = menu.flatMap((category) => category.items).find((item) => item.name.en === name);
    if (!found) throw new Error(`No dish ${name}`);
    return found;
  };
  const input = async (name: string, changes: Partial<MenuItemInput> = {}): Promise<MenuItemInput> => {
    const item = await dish(name);
    return {
      categoryId: item.categoryId,
      name: { en: item.name.en, el: item.name.el ?? "" },
      description: { en: item.description?.en ?? "", el: item.description?.el ?? "" },
      ingredients: { en: "", el: "" },
      priceCents: item.priceCents,
      vegetarian: item.vegetarian,
      vegan: item.vegan,
      spicy: item.spicy,
      signature: item.signature,
      chefRecommendation: item.chefRecommendation,
      available: item.available,
      active: item.active,
      displayOrder: item.displayOrder,
      allergenIds: item.allergens.map((allergen) => allergen.id),
      imageUrl: item.imageUrl ?? "",
      ...changes,
    };
  };
  const code = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
      return "NO_ERROR";
    } catch (error) {
      if (error instanceof ConfigError) return error.code;
      throw error;
    }
  };

  beforeAll(async () => {
    ctx = await openTestDatabase();
  });
  beforeEach(async () => {
    await resetTestDatabase(ctx.client);
    await seedInitialMenu(ctx.db);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it("seeds every section and dish in order, with the 14 allergens", async () => {
    const menu = await getMenu(ctx.db, { publicOnly: true });
    expect(menu.map((category) => category.name.en)).toEqual(MENU.map((category) => category.en));
    expect(menu.map((category) => category.items.length)).toEqual(MENU.map((category) => category.dishes.length));
    expect(menu[0].items[0].name.en).toBe("Prosciutto with Melon or Mozzarella");
    expect(await ctx.db.$count(schema.allergen)).toBe(14);
    expect((await dish("Baklava")).allergens.map((allergen) => allergen.code)).toEqual(["nuts"]);
  });

  it("a hidden dish leaves the public menu but stays in the manager's list", async () => {
    const item = await dish("Fruit Salad");
    await updateMenuItem(ctx.db, item.id, await input("Fruit Salad", { active: false }), MANAGER);
    const names = (menu: Awaited<ReturnType<typeof getMenu>>) =>
      menu.flatMap((category) => category.items).map((entry) => entry.name.en);
    expect(names(await getMenu(ctx.db, { publicOnly: true }))).not.toContain("Fruit Salad");
    expect(names(await getMenu(ctx.db, { publicOnly: false }))).toContain("Fruit Salad");
  });

  it("updates labels, allergens, price and photo together", async () => {
    const item = await dish("Greek Salad");
    const allergens = await ctx.db.select().from(schema.allergen);
    const milk = allergens.find((allergen) => allergen.code === "milk")!.id;
    await updateMenuItem(
      ctx.db,
      item.id,
      await input("Greek Salad", {
        name: { en: "Greek Salad", el: "Χωριάτικη" },
        vegetarian: true,
        priceCents: 1250,
        allergenIds: [milk],
        imageUrl: "https://example.com/greek-salad.jpg",
      }),
      MANAGER,
    );
    expect(await dish("Greek Salad")).toMatchObject({
      name: { el: "Χωριάτικη" },
      vegetarian: true,
      priceCents: 1250,
      imageUrl: "https://example.com/greek-salad.jpg",
      allergens: [{ code: "milk" }],
    });
  });

  it("an empty section is not shown to guests", async () => {
    await createMenuCategory(
      ctx.db,
      { name: { en: "Drinks", el: "Ποτά" }, description: { en: "", el: "" }, displayOrder: 9, active: true },
      MANAGER,
    );
    expect((await getMenu(ctx.db, { publicOnly: true })).map((category) => category.name.en)).not.toContain("Drinks");
    expect((await getMenu(ctx.db, { publicOnly: false })).map((category) => category.name.en)).toContain("Drinks");
  });

  it("rejects a dish without a name, with a negative price, an unknown allergen or a non-https photo", async () => {
    const base = await input("Greek Salad");
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect(await code(createMenuItem(ctx.db, { ...base, name: { en: " ", el: "" } }, MANAGER))).toBe("INVALID");
    expect(await code(createMenuItem(ctx.db, { ...base, priceCents: -5 }, MANAGER))).toBe("INVALID");
    expect(await code(createMenuItem(ctx.db, { ...base, allergenIds: [unknown] }, MANAGER))).toBe("INVALID");
    expect(await code(createMenuItem(ctx.db, { ...base, imageUrl: "javascript:alert(1)" }, MANAGER))).toBe("INVALID");
    expect(await code(createMenuItem(ctx.db, { ...base, categoryId: unknown }, MANAGER))).toBe("INVALID");
    expect(await code(createMenuItem(ctx.db, { ...base, name: { en: "Tzatziki", el: "Τζατζίκι" } }, MANAGER))).toBe("NO_ERROR");
  });
});
