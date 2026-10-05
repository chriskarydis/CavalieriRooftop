import { expect, test } from "@playwright/test";
import { MANAGER_SESSION } from "./global-setup";

test("public menu shows sections, dietary labels and allergens, without prices", async ({ page }) => {
  await page.goto("/en/menu");
  await expect(page.getByRole("heading", { name: "Dinner menu" })).toBeVisible();
  for (const section of ["Starters", "Mains", "Pasta", "Salads", "Desserts"]) {
    await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
  }
  const aubergines = page.getByRole("listitem").filter({ hasText: "Roasted Aubergines" });
  await expect(aubergines).toContainText("Vegetarian");
  await expect(page.getByRole("listitem").filter({ hasText: "Baklava" })).toContainText("Contains: Nuts");
  await expect(page.locator("main")).not.toContainText("€");

  // Greek: section names are translated; dishes fall back to English until the owner supplies Greek text.
  await page.goto("/el/menu");
  await expect(page.getByRole("heading", { name: "Ορεκτικά", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Greek Salad" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Baklava" })).toContainText("Περιέχει: Ξηροί καρποί");
});

test.describe("menu management", () => {
  test.use({ storageState: MANAGER_SESSION });

  test("manager translates, labels and hides dishes; the public menu follows", async ({ page }) => {
    await page.goto("/manage/menu");
    await expect(page.getByRole("heading", { name: "Menu", exact: true })).toBeVisible();

    // Give Greek Salad a Greek name and mark it as a signature dish with a price.
    const salad = page.locator("li", { has: page.locator("summary", { hasText: "Greek Salad" }) });
    await salad.locator("summary").click();
    await salad.getByLabel("Name (Greek)").fill("Χωριάτικη σαλάτα");
    await salad.getByLabel("Signature dish").check();
    await salad.getByLabel("Price (€, optional)").fill("12.50");
    await salad.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Saved.");

    // Take Fruit Salad off the menu.
    const fruit = page.locator("li", { has: page.locator("summary", { hasText: "Fruit Salad" }) });
    await fruit.locator("summary").click();
    await fruit.getByLabel("Shown on the menu").uncheck();
    await fruit.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Saved.");

    await page.goto("/el/menu");
    const greek = page.getByRole("listitem").filter({ hasText: "Χωριάτικη σαλάτα" });
    await expect(greek).toContainText("Σπεσιαλιτέ");
    await expect(page.getByText("Fruit Salad")).toHaveCount(0);
    // Prices stay hidden until the manager switches them on.
    await expect(page.locator("main")).not.toContainText("12,50");

    await page.goto("/manage/settings");
    await page.getByLabel("Show menu prices on the website").check();
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByRole("status")).toContainText("Saved.");
    await page.goto("/en/menu");
    await expect(page.getByRole("listitem").filter({ hasText: "Greek Salad" })).toContainText("€12.50");

    // Back to the owner's choice: no prices online.
    await page.goto("/manage/settings");
    await page.getByLabel("Show menu prices on the website").uncheck();
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByRole("status")).toContainText("Saved.");
  });
});
