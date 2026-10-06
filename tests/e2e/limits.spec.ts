import { expect, test } from "@playwright/test";
import { MANAGER_SESSION } from "./global-setup";

// An evening no other spec uses.
const DATE = "2027-08-26";
const search = `/en/reserve?date=${DATE}&time=20:00&guests=2`;

test("a guest holds one table at a time: choosing another releases the first", async ({ page, browser }) => {
  await page.goto(search);
  await page.getByRole("button", { name: /^Table 19, 2 seats, Standard, available/ }).click();
  await page.getByRole("button", { name: "Reserve this table" }).click();
  await expect(page.getByRole("timer")).toBeVisible();

  // Change of mind: back to the floor plan and pick another table.
  await page.goto(search);
  await expect(page.getByRole("img", { name: /^Table 19, 2 seats, Standard, being reserved/ })).toBeVisible();
  await page.getByRole("button", { name: /^Table 20, 2 seats, Standard, available/ }).click();
  await page.getByRole("button", { name: "Reserve this table" }).click();
  await expect(page.getByRole("timer")).toBeVisible();

  const other = await browser.newPage();
  await other.goto(search);
  await expect(other.getByRole("button", { name: /^Table 19, 2 seats, Standard, available/ })).toBeVisible();
  await expect(other.getByRole("img", { name: /^Table 20, 2 seats, Standard, being reserved/ })).toBeVisible();
  await other.close();
});

test.describe("staff", () => {
  test.use({ storageState: MANAGER_SESSION });

  test("a table kept by hand for a future evening is closed to online guests", async ({ page, browser }) => {
    await page.goto("/manage");
    await page.getByRole("button", { name: /^Table 30, 2 seats/ }).click();
    await expect(page.getByRole("heading", { name: "Table 30" })).toBeVisible();
    await page.getByLabel("From date").fill(DATE);
    await page.getByLabel("From time").fill("20:00");
    await page.getByLabel("Block from now for").selectOption({ label: "3 hours" });
    await page.getByLabel("Reason (optional)").fill("Papadopoulos, by phone");
    await page.getByRole("button", { name: "Block table" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

    const guest = await browser.newPage({ storageState: undefined });
    await guest.goto(search);
    await expect(guest.getByRole("img", { name: /^Table 30, 2 seats, Standard, unavailable/ })).toBeVisible();
    await guest.goto(`/en/reserve?date=${DATE}&time=23:00&guests=2`);
    await expect(guest.getByRole("button", { name: /^Table 30, 2 seats, Standard, available/ })).toBeVisible();
    await guest.close();

    await page.goto(`/manage/reservations?date=${DATE}`);
    const block = page.getByRole("listitem").filter({ hasText: "Papadopoulos, by phone" });
    await expect(block).toContainText("Table 30");
    await expect(block).toContainText("20:00–23:00");
    await block.getByRole("button", { name: "Remove block" }).click();
    await expect(page.getByText("Papadopoulos, by phone")).toHaveCount(0);
  });

  test("a new online reservation appears as a dashboard notification", async ({ page, browser }) => {
    const guest = await browser.newPage({ storageState: undefined });
    await guest.goto(search);
    await guest.getByRole("button", { name: /^Table 25, 2 seats, Standard, available/ }).click();
    await guest.getByRole("button", { name: "Reserve this table" }).click();
    await guest.getByLabel("Full name").fill("Nora Notified");
    await guest.getByLabel("Email").fill("nora@example.com");
    await guest.getByLabel("Mobile phone").fill("+30 690 000 0000");
    await guest.getByRole("checkbox").check();
    await guest.getByRole("button", { name: "Continue to payment" }).click();
    await guest.getByRole("button", { name: /^Pay / }).click();
    await expect(guest.getByRole("heading", { name: "Your reservation is confirmed" })).toBeVisible();
    await guest.close();

    await page.goto("/manage");
    const entry = page.getByRole("listitem").filter({ hasText: "Nora Notified" });
    await expect(entry).toContainText("New reservation");
    await expect(entry).toContainText("25");
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await expect(page.getByText("Nora Notified")).toHaveCount(0);
  });
});
