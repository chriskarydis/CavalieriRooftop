import { expect, test } from "@playwright/test";
import { E2E_STAFF } from "./global-setup";

test("the management area requires sign-in and is not advertised", async ({ page }) => {
  await page.goto("/manage");
  await expect(page).toHaveURL(/\/manage\/login$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await page.goto("/en");
  await expect(page.locator('a[href*="manage"]')).toHaveCount(0);
});

test("wrong password is refused", async ({ page }) => {
  await page.goto("/manage/login");
  await page.getByLabel("Email").fill(E2E_STAFF.email);
  await page.getByLabel("Password").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").first()).toContainText("The email or password is incorrect.");
});

test("manager seats a walk-in, frees the table, and can work in Greek", async ({ page }, testInfo) => {
  await page.goto("/manage/login");
  await page.getByLabel("Email").fill(E2E_STAFF.email);
  await page.getByLabel("Password").fill(E2E_STAFF.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Live floor" })).toBeVisible();
  await expect(page.getByText(`${E2E_STAFF.name} · Manager`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Table 29, 3 seats, Available" })).toBeVisible();

  // Seat three walk-in guests for drinks on table 29.
  await page.getByLabel("Guests").fill("3");
  await page.locator('select[name="tableIds"]').selectOption({ label: "29 (3)" });
  await page.getByLabel("Name (optional)").fill("Bar guests");
  await page.getByRole("button", { name: "Seat walk-in" }).click();
  await expect(page.getByRole("status")).toContainText("Walk-in seated until");
  await expect(page.getByRole("button", { name: "Table 29, 3 seats, Occupied" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Bar guests" })).toBeVisible();
  await testInfo.attach("live-floor", { body: await page.screenshot({ fullPage: true, path: process.env.SHOTS ? `${process.env.SHOTS}/live-floor.png` : undefined }), contentType: "image/png" });

  // The same table cannot be given to a second party.
  await page.locator('select[name="tableIds"]').selectOption({ label: "29 (3)" });
  await page.getByRole("button", { name: "Seat walk-in" }).click();
  await expect(page.getByRole("alert").first()).toContainText("That table is not free right now.");

  // A party that does not fit the table is refused.
  await page.getByLabel("Guests").fill("9");
  await page.locator('select[name="tableIds"]').selectOption({ label: "19 (2)" });
  await page.getByRole("button", { name: "Seat walk-in" }).click();
  await expect(page.getByRole("alert").first()).toContainText("That table cannot seat this number of guests.");

  // Guests leave.
  await page.getByRole("button", { name: "Release table" }).click();
  await expect(page.getByRole("button", { name: "Table 29, 3 seats, Available" })).toBeVisible();

  // Greek.
  await page.getByRole("button", { name: "Ελληνικά" }).click();
  await expect(page.getByRole("heading", { name: "Σάλα σε πραγματικό χρόνο" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Άφιξη χωρίς κράτηση" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/manage\/login$/);
});
