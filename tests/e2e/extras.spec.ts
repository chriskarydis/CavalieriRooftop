import { expect, test, type Browser } from "@playwright/test";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "../../playwright.config";
import { MANAGER_SESSION } from "./global-setup";

// Evenings no other spec uses: a Tuesday and a Wednesday in season.
const DATE = "2027-09-21";
const FULL_DATE = "2027-09-22";

/** Set SHOTS to a folder to keep screenshots of the new screens. */
const shot = (name: string): string | undefined => (process.env.SHOTS ? `${process.env.SHOTS}/${name}.png` : undefined);

test.use({ storageState: MANAGER_SESSION });
test.describe.configure({ mode: "serial" });

/** A visitor with no staff session books table 30 for two and says it is a birthday. */
async function bookAsGuest(browser: Browser): Promise<{ reference: string; calendarFile: string; googleLink: string }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto(`/en/reserve?date=${DATE}&time=20:00&guests=2`);
  await page.getByRole("button", { name: /^Table 30, 2 seats, Standard, available/ }).click();
  await page.getByRole("button", { name: "Reserve this table" }).click();
  await page.getByLabel("Full name").fill("Olga Occasion");
  await page.getByLabel("Email").fill("olga@example.com");
  await page.getByLabel("Mobile phone").fill("+30 690 555 0101");
  await page.getByLabel("Are you celebrating something? (optional)").selectOption({ label: "Birthday" });
  await page.getByLabel("Notes (optional)").fill("A candle on the dessert, please");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByRole("heading", { name: "Your reservation is confirmed" })).toBeVisible();

  // The occasion is shown back, and the reservation can go into the guest's calendar.
  await expect(page.getByRole("definition").filter({ hasText: "Birthday" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add to your calendar" })).toBeVisible();
  await page.screenshot({ fullPage: true, path: shot("confirmation-calendar") });
  const googleLink = (await page.getByRole("link", { name: "Google Calendar" }).getAttribute("href")) ?? "";
  const calendarFile = (await page.getByRole("link", { name: "Apple Calendar or Outlook" }).getAttribute("href")) ?? "";
  const file = await page.request.get(calendarFile);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toContain("text/calendar");
  const body = await file.text();
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toContain("DTSTART:20270921T170000Z");
  expect(body).toContain("SUMMARY:Dinner at Cavalieri Roof Garden");

  const reference = (await page.getByText(/^CRG-\d+$/).textContent()) ?? "";
  await context.close();
  return { reference, calendarFile, googleLink };
}

test("occasion, calendar, notes, guest history, bell and downloads", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "management pages are covered on desktop");
  test.setTimeout(120_000);
  const { reference, calendarFile, googleLink } = await bookAsGuest(browser);
  expect(googleLink).toContain("https://calendar.google.com/calendar/render?");
  expect(googleLink).toContain("dates=20270921T170000Z%2F20270921T190000Z");
  // The calendar file needs the secret link: a wrong token finds nothing.
  expect((await page.request.get(calendarFile.replace(/reservation\/[^/]+/, "reservation/not-a-token"))).status()).toBe(404);

  // The bell is on every management page and counts the new reservation.
  await page.goto("/manage/timeline");
  await expect(page.getByRole("link", { name: /^Unread notifications: \d+$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sound on" })).toBeVisible();

  // The list shows what the guest said, and staff add their own note.
  await page.goto(`/manage/reservations?date=${DATE}`);
  const row = page.getByRole("row").filter({ hasText: "Olga Occasion" });
  await expect(row).toContainText("Birthday");
  await expect(row).toContainText("Guest's note: A candle on the dessert, please");
  await row.getByRole("button", { name: "Add note" }).click();
  const noteWindow = page.getByRole("dialog", { name: "Note on the reservation of Olga Occasion" });
  await noteWindow.getByLabel("Staff note").fill("Cake ordered from the pastry chef");
  await noteWindow.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("status")).toContainText("The reservation was updated.");
  await expect(row).toContainText("Staff note: Cake ordered from the pastry chef");
  await expect(row.getByRole("button", { name: "Edit note" })).toBeVisible();

  // The guest's own page: no earlier visits yet, and a standing note that follows them.
  await row.getByRole("link", { name: "Olga Occasion" }).click();
  await expect(page.getByRole("heading", { name: "Olga Occasion" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reservation history" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: reference })).toContainText("Birthday");
  await page.screenshot({ fullPage: true, path: shot("guest-page") });
  await page.getByLabel("Standing note about the guest").fill("Allergic to shellfish");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("status")).toContainText("The note was saved.");
  await page.goto(`/manage/reservations?date=${DATE}`);
  await expect(row).toContainText("Standing note about the guest: Allergic to shellfish");
  await testInfo.attach("reservation-notes", { body: await page.screenshot({ fullPage: true, path: shot("reservation-notes") }), contentType: "image/png" });

  // A second reservation taken by staff for the same phone number shows the note at once.
  await page.getByRole("button", { name: "New reservation" }).click();
  const create = page.getByRole("dialog", { name: "New reservation (no deposit)" });
  await create.getByLabel("Guest's name").fill("Olga O.");
  await create.getByLabel("Phone").fill("690 555 0101");
  await create.getByLabel("Occasion (optional)").selectOption({ label: "Anniversary" });
  await create.getByLabel("Time").selectOption("22:00");
  await create.getByRole("button", { name: "Create reservation" }).click();
  await expect(page.getByRole("status")).toContainText("created");
  const second = page.getByRole("row").filter({ hasText: "Olga O." });
  await expect(second).toContainText("Anniversary");
  await expect(second).toContainText("Standing note about the guest: Allergic to shellfish");

  // Downloads for Excel: the reservations of the day, and the figures.
  const reservations = await page.request.get(`/manage/export?kind=reservations&from=${DATE}&to=${DATE}`);
  expect(reservations.status()).toBe(200);
  expect(reservations.headers()["content-disposition"]).toContain(`cavalieri-reservations-${DATE}-${DATE}.csv`);
  const csv = await reservations.text();
  expect(csv).toContain("Reservation;Date;Time;Guests;Table;Name");
  expect(csv).toContain(`${reference};21/09/2027;20:00;2;30;Olga Occasion;'+30 690 555 0101;olga@example.com;Confirmed;Online;Guest;Birthday;60,00;0,00;60,00;0,00`);
  expect(csv).toContain("Cake ordered from the pastry chef");
  const summary = await page.request.get(`/manage/export?kind=summary&from=${DATE}&to=${DATE}`);
  expect(await summary.text()).toContain("Period;21/09/2027 - 21/09/2027");
  expect((await page.request.get("/manage/export?kind=reservations&from=2027-09-21&to=2020-01-01")).status()).toBe(400);
  await page.goto(`/manage/analytics?from=${DATE}&to=${DATE}`);
  await expect(page.getByRole("link", { name: "Download reservations (Excel)" })).toHaveAttribute("href", `/manage/export?kind=reservations&from=${DATE}&to=${DATE}`);
  await expect(page.getByRole("link", { name: "Download figures (Excel)" })).toBeVisible();
});

test("downloads and notifications are for staff only", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "management pages are covered on desktop");
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const response = await context.request.get(`/manage/export?kind=reservations&from=${DATE}&to=${DATE}`, { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(response.status());
  expect((await context.request.get("/manage/notifications")).status()).toBe(401);
  await context.close();
});

test("the menu setup page shows one list at a time", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "management pages are covered on desktop");
  await page.goto("/manage/menu");
  const tabs = page.getByRole("navigation", { name: "List" });
  await expect(tabs.getByRole("link", { name: /^Dinner menu/ })).toHaveAttribute("aria-current", "page");
  // Each section is a row that opens; only the sections of the list in view are on the page.
  const section = (name: string) => page.locator("summary").filter({ hasText: name });
  await expect(section("Starters").first()).toBeVisible();
  await expect(section("Retsina")).toHaveCount(0);
  await tabs.getByRole("link", { name: /^Wine list/ }).click();
  await expect(tabs.getByRole("link", { name: /^Wine list/ })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: shot("menu-tabs") });
  await expect(section("Retsina").first()).toBeVisible();
  await expect(section("Starters")).toHaveCount(0);
});

test("a full evening offers the waiting list, and staff see and manage it", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "management pages are covered on desktop");
  test.setTimeout(90_000);
  // Every table is closed for that evening, so nothing can be booked.
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  await sql`
    INSERT INTO table_allocation (table_id, period, kind, reason)
    SELECT id, tstzrange('2027-09-22 15:00+00', '2027-09-22 22:00+00'), 'BLOCK', 'Private event (test)' FROM dining_table`;
  await sql.end();

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const visitor = await context.newPage();
  await visitor.goto(`/en/reserve?date=${FULL_DATE}&time=20:00&guests=2`);
  await expect(visitor.getByText("There are no tables free for this party at that time.")).toBeVisible();
  await expect(visitor.getByRole("heading", { name: "Tell me if a table becomes free" })).toBeVisible();
  await visitor.getByLabel("Full name").fill("Wanda Waiting");
  await visitor.getByLabel("Email").fill("wanda@example.com");
  await visitor.getByLabel("Mobile phone (optional)").fill("+30 690 555 0202");
  await visitor.getByRole("checkbox").check();
  await testInfo.attach("waiting-form", { body: await visitor.screenshot({ fullPage: true, path: shot("waiting-form") }), contentType: "image/png" });
  await visitor.getByRole("button", { name: "Add me to the waiting list" }).click();
  await expect(visitor.getByRole("heading", { name: "You are on the waiting list" })).toBeVisible();
  await context.close();

  await page.goto(`/manage/reservations?date=${FULL_DATE}`);
  const list = page.getByRole("region", { name: "Waiting list (1)" });
  await expect(list).toContainText("Wanda Waiting");
  await expect(list).toContainText("20:00");
  await expect(list).toContainText("2 guests");
  await expect(list).toContainText("wanda@example.com");
  await expect(list).toContainText("Waiting");
  await page.screenshot({ fullPage: true, path: shot("waiting-staff") });
  await list.getByRole("button", { name: "Email now" }).click();
  await expect(page.getByRole("region", { name: "Waiting list (1)" })).toContainText(/Emailed at \d{2}:\d{2}/);
  await page.getByRole("region", { name: "Waiting list (1)" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("heading", { name: /^Waiting list/ })).toHaveCount(0);

  // The evening is given back to the other specs.
  const cleanup = postgres(E2E_DATABASE_URL, { max: 1 });
  await cleanup`DELETE FROM table_allocation WHERE reason = 'Private event (test)'`;
  await cleanup.end();
});
