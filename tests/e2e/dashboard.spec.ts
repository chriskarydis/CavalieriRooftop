import { expect, test, type Page } from "@playwright/test";
import { MANAGER_SESSION } from "./global-setup";

// An evening no other spec books on.
const DATE = "2027-08-19";

test.use({ storageState: MANAGER_SESSION });

async function openDashboard(page: Page): Promise<void> {
  await page.goto("/manage");
  await expect(page.getByRole("heading", { name: "Live floor" })).toBeVisible();
}

async function bookTable(page: Page, table: RegExp, guest: string): Promise<void> {
  await page.goto(`/en/reserve?date=${DATE}&time=20:00&guests=2`);
  await page.getByRole("button", { name: table }).click();
  await page.getByRole("button", { name: "Reserve this table" }).click();
  await page.getByLabel("Full name").fill(guest);
  await page.getByLabel("Email").fill("guest@example.com");
  await page.getByLabel("Mobile phone").fill("+30 690 000 0000");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByRole("heading", { name: "Your reservation is confirmed" })).toBeVisible();
}

test("manager finds a reservation, moves it with a price warning, and cancels it", async ({ page }) => {
  await bookTable(page, /^Table 19, 2 seats, Standard, available/, "Maria Mover");
  await openDashboard(page);

  await page.getByRole("link", { name: "Reservations" }).click();
  // The date changes the list at once, without a button.
  // Retried in case the page is still starting up when the date is typed.
  await expect(async () => {
    await page.getByLabel("Date").fill(DATE);
    await expect(page).toHaveURL(new RegExp(`date=${DATE}`), { timeout: 2000 });
  }).toPass();
  await expect(page.getByText("1 reservation · 2 guests expected")).toBeVisible();
  // A search looks through every date.
  await page.getByLabel("Search name, phone, email or reference").fill("mover");
  await expect(page.getByText("Searching every date.")).toBeVisible();
  await expect(page).toHaveURL(/q=mover/);
  await expect(page.getByRole("row", { name: /Maria Mover/ })).toContainText(DATE.split("-").reverse().join("/"));
  await page.getByLabel("Search name, phone, email or reference").fill("");
  await expect(page).not.toHaveURL(/q=/);
  const row = page.getByRole("row", { name: /Maria Mover/ });
  await expect(row).toContainText("19");
  await expect(row).toContainText("Confirmed");
  await expect(page.getByText("1 reservation · 2 guests expected")).toBeVisible();
  // The evening in numbers: one reservation for two, 60 deposit, no table fee.
  const totals = page.getByRole("region", { name: "Summary of the evening" });
  await expect(totals).toContainText("Deposits€60.00");
  await expect(totals).toContainText("Table fees€0.00");
  await expect(totals).toContainText("Paid online in total€60.00");
  await expect(page.getByRole("button", { name: "Print this list" })).toBeVisible();

  // Move to premium table 1: the price difference is shown and nothing is charged.
  // It happens in a window on this page, without going to the live floor.
  await row.getByRole("button", { name: "Change table" }).click();
  const tableWindow = page.getByRole("dialog");
  await expect(tableWindow).toContainText("The reservation is now at table 19. Where do you want to move it?");
  await tableWindow.getByLabel("Move to table").selectOption({ label: "1 (5)" });
  await tableWindow.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("The reservation was updated.");
  await expect(page).toHaveURL(/\/manage\/reservations/);

  await page.goto(`/manage/reservations?date=${DATE}`);
  const moved = page.getByRole("row", { name: /Maria Mover/ });
  await expect(moved.getByRole("cell").nth(1)).toContainText("1");
  // The table was given by the manager, and the list says so.
  await expect(moved.getByRole("cell").nth(1)).toContainText("set by staff");
  await expect(moved).not.toContainText("chosen by guest");
  await expect(moved).toContainText("€60 / €0");

  // Change the time and the number of guests in the other window: straight away, still on this page.
  await moved.getByRole("button", { name: "Change date or time" }).click();
  const dateWindow = page.getByRole("dialog");
  await expect(dateWindow).toContainText("20:00, 2 guests, table 1.");
  await dateWindow.getByLabel("Time").selectOption("21:00");
  await dateWindow.getByLabel("Guests").fill("4");
  await dateWindow.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("The reservation was updated.");
  const changed = page.getByRole("row", { name: /Maria Mover/ });
  await expect(changed).toContainText("21:00");
  await expect(changed.getByRole("cell").nth(3)).toHaveText("4");
  await expect(changed).toContainText("€60 / €0");
  // Back to 20:00 for the checks below.
  await changed.getByRole("button", { name: "Change date or time" }).click();
  await page.getByRole("dialog").getByLabel("Time").selectOption("20:00");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("The reservation was updated.");

  // The guest's old table is free again, the new one is taken.
  const guest = await page.context().browser()!.newPage();
  await guest.goto(`/en/reserve?date=${DATE}&time=20:00&guests=2`);
  await expect(guest.getByRole("button", { name: /^Table 19, 2 seats, Standard, available/ })).toBeVisible();
  await expect(guest.getByRole("img", { name: /^Table 1, 4 seats, Premium, unavailable/ })).toBeVisible();
  await guest.close();

  await moved.getByText("Cancel", { exact: true }).click();
  await moved.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByRole("row", { name: /Maria Mover/ })).toContainText("Cancelled");
});

test("manager blocks a table from its details and removes the block", async ({ page }) => {
  await openDashboard(page);
  await page.getByRole("button", { name: "Table 22, 2 seats, Available" }).click();
  await expect(page.getByRole("heading", { name: "Table 22" })).toBeVisible();
  await page.getByRole("button", { name: "Close this table" }).click();
  const block = page.getByRole("dialog");
  await block.getByLabel("Reason (optional)").fill("Wobbly");
  await block.getByRole("button", { name: "Close table" }).click();
  await expect(page.getByRole("button", { name: "Table 22, 2 seats, Blocked" })).toBeVisible();
  await expect(page.getByText("Wobbly").first()).toBeVisible();

  await page.getByRole("button", { name: "Remove block" }).first().click();
  await expect(page.getByRole("button", { name: "Table 22, 2 seats, Available" })).toBeVisible();
});

test("manager changes a category fee and disables a table; guests see both at once", async ({ page }) => {
  await openDashboard(page);

  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("link", { name: /^Categories/ }).click();
  const preferred = page.locator("section", { has: page.getByRole("heading", { name: /^Preferred/ }) });
  await preferred.getByLabel("Extra fee (€)").fill("25");
  await preferred.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Changes saved.");

  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("link", { name: /^Tables/ }).click();
  const table21 = page.locator("details", { has: page.getByText("Table 21", { exact: true }) });
  await table21.locator("summary").click();
  await table21.getByLabel("Status").selectOption("OUT_OF_SERVICE");
  await table21.getByLabel("Reason (when not active)").fill("Repair");
  await table21.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Changes saved.");

  await page.goto(`/en/reserve?date=${DATE}&time=21:00&guests=4`);
  await page.getByRole("button", { name: /^Table 6, 4 seats, Preferred, available/ }).click();
  await expect(page.locator("section[aria-live]")).toContainText("€25.00");
  await expect(page.getByRole("button", { name: /^Table 21,/ })).toHaveCount(0);
  await expect(page.getByRole("img", { name: /^Table 21,/ })).toHaveCount(0);

  // Restore, so the suite can be re-run against the same server.
  await page.goto("/manage/categories");
  await preferred.getByLabel("Extra fee (€)").fill("20");
  await preferred.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toContainText("Changes saved.");
});

test("settings: a closed date stops online booking, in Greek too", async ({ page }) => {
  await openDashboard(page);
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByRole("link", { name: /^Settings/ }).click();
  await expect(page.getByLabel("Deposit per person (€)")).toHaveValue("30");
  await page.getByLabel("Date", { exact: true }).fill("2027-08-20");
  await page.getByLabel("Reason (optional)").fill("Private event");
  await page.getByRole("button", { name: "Close this date" }).click();
  await expect(page.getByText("20/08/2027 · Private event")).toBeVisible();

  await page.goto("/el/reserve?date=2027-08-20&time=20:00&guests=2");
  await expect(page.getByRole("alert").first()).toContainText("Είμαστε κλειστά εκείνη την ημέρα");

  await page.goto("/manage/settings");
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText("No closed dates.")).toBeVisible();

  await page.getByRole("button", { name: "Ελληνικά" }).click();
  await expect(page.getByRole("heading", { name: "Ρυθμίσεις κρατήσεων" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
});

test("manager takes a reservation by phone, with no deposit", async ({ page }) => {
  const date = "2027-08-26";
  await page.goto(`/manage/reservations?date=${date}`);
  await page.getByRole("button", { name: "New reservation" }).click();
  const window = page.getByRole("dialog");
  await window.getByLabel("Guest's name").fill("Petros Phone");
  await window.getByLabel("Phone").fill("+30 690 123 0000");
  await window.getByLabel("Guests").fill("4");
  await window.getByLabel("Time").selectOption("21:15");
  await window.getByLabel("Table").selectOption({ label: "13 (4)" });
  await window.getByRole("button", { name: "Create reservation" }).click();

  await expect(page.getByRole("status")).toContainText(/Reservation CRG-\d+ created\./);
  const row = page.getByRole("row", { name: /Petros Phone/ });
  await expect(row).toContainText("21:15");
  await expect(row).toContainText("13");
  await expect(row).toContainText("taken by staff");
  await expect(row).toContainText("€0 / €0");

  // Online guests no longer see table 13 free at that time.
  const guest = await page.context().browser()!.newPage();
  await guest.goto(`/en/reserve?date=${date}&time=21:00&guests=4`);
  await expect(guest.getByRole("img", { name: /^Table 13, 4 seats, Standard, unavailable/ })).toBeVisible();
  await guest.close();
});
