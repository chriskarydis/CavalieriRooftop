import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "../../playwright.config";
import { MANAGER_SESSION } from "./global-setup";

// An evening no other spec uses.
const DATE = "2027-09-28";

// Tall enough for the whole floor plan, so both tables are on screen.
test.use({ storageState: MANAGER_SESSION, viewport: { width: 1400, height: 1800 } });

test("a reservation is dragged to another table on the live floor and moves once confirmed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "dragging with a mouse");
  test.setTimeout(90_000);

  const context = await page.context().browser()!.newContext();
  const visitor = await context.newPage();
  await visitor.goto(`/en/reserve?date=${DATE}&time=20:00&guests=2`);
  await visitor.getByRole("button", { name: /^Table 31, 2 seats, Standard, available/ }).click();
  await visitor.getByRole("button", { name: "Reserve this table" }).click();
  await visitor.getByLabel("Full name").fill("Dora Dragged");
  await visitor.getByLabel("Email").fill("dora@example.com");
  await visitor.getByLabel("Mobile phone").fill("+30 690 777 0000");
  await visitor.getByRole("checkbox").check();
  await visitor.getByRole("button", { name: "Continue to payment" }).click();
  await visitor.getByRole("button", { name: /^Pay / }).click();
  await expect(visitor.getByRole("heading", { name: "Your reservation is confirmed" })).toBeVisible();
  await context.close();

  // The live floor shows the next 12 hours, so bring the reservation to an hour from now.
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`
    WITH moved AS (
      UPDATE reservation SET starts_at = now() + interval '1 hour'
      WHERE customer_id IN (SELECT id FROM customer WHERE name = 'Dora Dragged')
      RETURNING id
    )
    UPDATE table_allocation SET period = tstzrange(now() + interval '1 hour', now() + interval '3 hours 30 minutes')
    WHERE reservation_id IN (SELECT id FROM moved)`;
  await sql.end();

  await page.goto("/manage");
  const from = page.getByRole("button", { name: /^Table 31, 2 seats, Reserved later/ });
  const to = page.getByRole("button", { name: /^Table 32, 2 seats, Available/ });
  await expect(from).toBeVisible();
  const start = (await from.boundingBox())!;
  const end = (await to.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 5, start.y + start.height / 2 + 20, { steps: 4 });
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 });
  // While it is carried, the table follows the pointer.
  await expect(page.locator("svg circle")).toHaveCount(1);
  await page.mouse.up();

  // The drop opens the usual preview; nothing has moved yet.
  const move = page.getByRole("region", { name: /Dora Dragged/ });
  await expect(move).toBeVisible();
  await expect(move).toBeInViewport();
  await expect(move).toContainText("31");
  await expect(move).toContainText("32");
  await move.getByRole("button", { name: "Confirm move" }).click();
  await expect(page.getByRole("button", { name: /^Table 32, 2 seats, Reserved later/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Table 31, 2 seats, Available/ })).toBeVisible();

  // A plain click still just opens the table.
  await page.getByRole("button", { name: /^Table 32, 2 seats, Reserved later/ }).click();
  await expect(page.getByRole("heading", { name: "Table 32" })).toBeVisible();
});

test("a walk-in party is dragged to another table", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "dragging with a mouse");
  await page.goto("/manage");
  await page.getByLabel("Guests").fill("2");
  await page.locator('select[name="tableIds"]').selectOption({ label: "25 (2)" });
  await page.getByLabel("Name (optional)").fill("Wanda Walkin");
  await page.getByRole("button", { name: "Seat walk-in" }).click();
  await expect(page.getByRole("status")).toContainText("Walk-in seated until");

  const from = page.getByRole("button", { name: /^Table 25, 2 seats, Occupied/ });
  const to = page.getByRole("button", { name: /^Table 30, 2 seats, Available/ });
  const start = (await from.boundingBox())!;
  const end = (await to.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 - 20, start.y + start.height / 2 - 5, { steps: 4 });
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 });
  await page.mouse.up();

  const move = page.getByRole("region", { name: "Move walk-in: Wanda Walkin" });
  await expect(move).toContainText("From table 25 to table 30.");
  await move.getByRole("button", { name: "Confirm move" }).click();
  await expect(page.getByRole("button", { name: /^Table 30, 2 seats, Occupied/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Table 25, 2 seats, Available/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Wanda Walkin/ })).toContainText("30");
  await page.getByRole("row", { name: /Wanda Walkin/ }).getByRole("button", { name: "Table free" }).click();
  await expect(page.getByRole("button", { name: /^Table 30, 2 seats, Available/ })).toBeVisible();
});
