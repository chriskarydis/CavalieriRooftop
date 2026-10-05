import { expect, test, type Page } from "@playwright/test";
import { MANAGER_SESSION } from "./global-setup";

// An evening no other spec uses.
const DATE = "2027-09-02";
const shot = (name: string): string | undefined => (process.env.SHOTS ? `${process.env.SHOTS}/${name}.png` : undefined);

test.use({ storageState: MANAGER_SESSION });

async function book(page: Page, table: RegExp, guest: string, time: string): Promise<void> {
  const context = await page.context().browser()!.newContext();
  const visitor = await context.newPage();
  await visitor.goto(`/en/reserve?date=${DATE}&time=${time}&guests=2`);
  await visitor.getByRole("button", { name: table }).click();
  await visitor.getByRole("button", { name: "Reserve this table" }).click();
  await visitor.getByLabel("Full name").fill(guest);
  await visitor.getByLabel("Email").fill("guest@example.com");
  await visitor.getByLabel("Mobile phone").fill("+30 690 000 0000");
  await visitor.getByRole("checkbox").check();
  await visitor.getByRole("button", { name: "Continue to payment" }).click();
  await visitor.getByRole("button", { name: /^Pay / }).click();
  await expect(visitor.getByRole("heading", { name: "Your reservation is confirmed" })).toBeVisible();
  await context.close();
}

test("timeline and analytics reflect the evening's reservations", async ({ page }) => {
  await book(page, /^Table 3, 4 seats, Premium, available/, "Tina Timeline", "19:00");
  await book(page, /^Table 26, 2 seats, Standard, available/, "Andreas Analytics", "21:30");

  await page.goto(`/manage/timeline?date=${DATE}`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.getByText(/19:00–21:30 · Tina Timeline · 2 · CRG-\d+ · Reserved/)).toBeAttached();
  await expect(page.getByText(/21:30–00:00 · Andreas Analytics · 2/)).toBeAttached();
  await page.screenshot({ fullPage: true, path: shot("timeline") });

  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(/date=2027-09-03/);
  await expect(page.getByText("Tina Timeline")).toHaveCount(0);

  await page.goto(`/manage/analytics?from=${DATE}&to=${DATE}`);
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  const tile = (label: string) => page.locator("div", { has: page.getByText(label, { exact: true }) }).last();
  await expect(tile("Reservations made")).toContainText("2");
  await expect(tile("Guests who came or are expected")).toContainText("4");
  // Table 3 is premium: two guests pay for four seats (120) plus the 50 fee; table 26 is 60.
  await expect(tile("Deposits")).toContainText("€180");
  await expect(tile("Table selection fees")).toContainText("€50");
  await expect(page.getByRole("row", { name: /Table 3/ })).toContainText("€50");
  await expect(page.getByRole("row", { name: /Premium/ })).toContainText("€50");
  await expect(page.getByRole("row", { name: /^19:00/ })).toContainText("1");
  await page.screenshot({ fullPage: true, path: shot("analytics") });

  await page.getByRole("button", { name: "Ελληνικά" }).click();
  await expect(page.getByRole("heading", { name: "Στατιστικά" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
});

test("closing several tables for weather hides them from guests; reopening restores them", async ({ page, browser }) => {
  await page.goto("/manage/tables");
  for (const number of ["31", "32"]) await page.getByRole("checkbox", { name: number, exact: true }).check();
  await page.getByLabel("Reason (when not active)").first().fill("Rain");
  await page.getByRole("button", { name: "Take out of service" }).click();
  await expect(page.getByRole("status")).toContainText("2 tables changed.");

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/en/reserve?date=${DATE}&time=23:00&guests=2`);
  await expect(guest.getByRole("button", { name: /^Table 30,/ })).toBeVisible();
  await expect(guest.getByRole("button", { name: /^Table 31,/ })).toHaveCount(0);
  await expect(guest.getByRole("button", { name: /^Table 32,/ })).toHaveCount(0);

  for (const number of ["31", "32"]) await page.getByRole("checkbox", { name: number, exact: true }).check();
  await page.getByRole("button", { name: "Put back in service" }).click();
  await expect(page.getByRole("status")).toContainText("2 tables changed.");
  await guest.reload();
  await expect(guest.getByRole("button", { name: /^Table 31,/ })).toBeVisible();
  await guest.close();
});

test("floor plan editor: move a table with the keyboard, save, and guests see the new position", async ({ page }) => {
  await page.goto("/manage/floor");
  await expect(page.getByRole("heading", { name: "Floor plan" })).toBeVisible();
  const table = page.getByRole("button", { name: "Table 28", exact: true });
  await table.focus();
  const across = page.getByLabel("Position across");
  const before = Number(await across.inputValue());
  for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowLeft");
  await expect(across).toHaveValue(String(before - 20));
  await expect(page.getByText("Changes not saved yet.")).toBeVisible();
  await page.screenshot({ fullPage: true, path: shot("floor-editor") });

  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.getByRole("button", { name: "Table 28", exact: true }).focus();
  await expect(page.getByLabel("Position across")).toHaveValue(String(before - 20));

  // Put it back so the suite can be re-run.
  for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  // Adding a table: it exists, inactive, and can then be placed.
  await page.getByLabel("Table number").fill("34");
  await page.getByRole("button", { name: "Add table" }).click();
  await expect(page.getByRole("button", { name: "Table 34", exact: true })).toBeVisible();
  await page.getByLabel("Table number").fill("34");
  await page.getByRole("button", { name: "Add table" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("That already exists.");
});
