import { expect, test } from "@playwright/test";
import { MANAGER_SESSION } from "./global-setup";

test("public menu shows sections, dietary labels and allergens, without prices", async ({ page }) => {
  await page.goto("/en/menu");
  await expect(page.getByRole("heading", { name: "Our menus" })).toBeVisible();
  // Three lists, each opening in its own window.
  await expect(page.getByRole("button", { name: /^Bar list/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Wine list/ })).toBeVisible();
  await page.getByRole("button", { name: /^Dinner menu/ }).click();
  await expect(page.getByRole("dialog", { name: "Dinner menu" })).toBeVisible();
  for (const section of ["Starters", "Mains", "Pasta", "Salads", "Desserts"]) {
    await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
  }
  const aubergines = page.getByRole("listitem").filter({ hasText: "Roasted Aubergines" });
  await expect(aubergines).toContainText("Vegetarian");
  await expect(page.getByRole("listitem").filter({ hasText: "Baklava" })).toContainText("Contains: Nuts");
  await expect(page.locator("main")).not.toContainText("€");
  await expect(page.getByRole("listitem").filter({ hasText: "Corfiot Salad" })).toContainText("noumboulo");
  await expect(page.getByText("Mexican Salad")).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: /^Wine list/ }).click();
  await expect(page.getByRole("dialog", { name: "Wine list" }).getByRole("heading", { name: "Retsina", exact: true })).toBeVisible();
  // The strip of sections marks where the reader is, and follows when a section is chosen.
  const strip = page.getByRole("dialog", { name: "Wine list" }).getByRole("navigation", { name: "Menu sections" });
  await expect(strip.getByRole("button", { name: "White Wine by the Glass" })).toHaveAttribute("aria-current", "true");
  await strip.getByRole("button", { name: "Champagne and Sparkling Wines" }).click();
  await expect(strip.getByRole("button", { name: "Champagne and Sparkling Wines" })).toHaveAttribute("aria-current", "true");
  await expect(strip.getByRole("button", { name: "Champagne and Sparkling Wines" })).toBeInViewport();
  await expect(strip.getByRole("button", { name: "White Wine by the Glass" })).not.toHaveAttribute("aria-current", "true");

  // Greek: sections and dishes in Greek, as on the restaurant's own Greek menu.
  await page.goto("/el/menu");
  await page.getByRole("button", { name: /^Κατάλογος φαγητού/ }).click();
  await expect(page.getByRole("heading", { name: "Ορεκτικά", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Σαλάτα Κορφιάτα" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Μπακλαβάς" })).toContainText("Περιέχει: Ξηροί καρποί");
});

/** The menu page holds three lists (about 180 entries), so a save takes a while to come back. */
const SAVE_TIMEOUT = 20_000;

test.describe("menu management", () => {
  test.setTimeout(120_000);
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
    await expect(page.getByRole("status")).toContainText("Saved.", { timeout: SAVE_TIMEOUT });

    // Take Fruit Salad off the menu.
    const fruit = page.locator("li", { has: page.locator("summary", { hasText: "Fruit Salad" }) });
    await fruit.locator("summary").click();
    await fruit.getByLabel("Shown on the menu").uncheck();
    await fruit.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Saved.", { timeout: SAVE_TIMEOUT });

    await page.goto("/el/menu");
    await page.getByRole("button", { name: /^Κατάλογος φαγητού/ }).click();
    const greek = page.getByRole("listitem").filter({ hasText: "Χωριάτικη σαλάτα" });
    await expect(greek).toContainText("Σπεσιαλιτέ");
    await expect(page.getByText("Φρουτοσαλάτα")).toHaveCount(0);
    // Prices stay hidden until the manager switches them on.
    await expect(page.locator("main")).not.toContainText("12,50");

    await page.goto("/manage/settings");
    await page.getByLabel("Show menu prices on the website").check();
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByRole("status")).toContainText("Saved.", { timeout: SAVE_TIMEOUT });
    await page.goto("/en/menu");
    await page.getByRole("button", { name: /^Dinner menu/ }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Greek Salad" })).toContainText("€12.50");

    // Back to the owner's choice: no prices online.
    await page.goto("/manage/settings");
    await page.getByLabel("Show menu prices on the website").uncheck();
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByRole("status")).toContainText("Saved.", { timeout: SAVE_TIMEOUT });
  });
});
