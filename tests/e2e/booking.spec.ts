import { expect, test, type Page, type TestInfo } from "@playwright/test";

/** Set SHOTS to a folder to keep screenshots of the key screens. */
const shot = (testInfo: TestInfo, name: string): string | undefined =>
  process.env.SHOTS ? `${process.env.SHOTS}/${name}-${testInfo.project.name}.png` : undefined;

// Each project (desktop, mobile) books on its own evening so the runs do not collide.
const DATES: Record<string, string> = { desktop: "2027-08-12", mobile: "2027-08-13" };

async function search(page: Page, locale: string, date: string, guests: number): Promise<void> {
  await page.goto(`/${locale}/reserve?date=${date}&time=20:00&guests=${guests}`);
}

async function fillDetails(page: Page): Promise<void> {
  await page.getByLabel("Full name").fill("Test Guest");
  await page.getByLabel("Email").fill("guest@example.com");
  await page.getByLabel("Mobile phone").fill("+30 690 000 0000");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue to payment" }).click();
}

test("guest chooses a premium table, pays and cancels with a full refund", async ({ page, browser }, testInfo) => {
  const date = DATES[testInfo.project.name];

  await page.goto("/en/reserve");
  // The calendar opens on the next month with an open evening; walk forward to the booking month.
  const submit = page.getByRole("button", { name: "See available tables" });
  await expect(submit).toBeDisabled();
  while (!(await page.getByText("August 2027", { exact: true }).isVisible())) {
    await page.getByRole("button", { name: "Next month" }).click();
  }
  await page.getByRole("button", { name: new RegExp(`${Number(date.slice(8))} August 2027`) }).click();
  await page.getByRole("group", { name: "Time" }).getByText("20:00", { exact: true }).click();
  await page.getByRole("group", { name: "Guests" }).getByText("2", { exact: true }).click();
  await testInfo.attach("calendar", { body: await page.screenshot({ fullPage: true, path: shot(testInfo, "calendar") }), contentType: "image/png" });
  await page.getByRole("button", { name: "See available tables" }).click();

  // "Let us choose" is offered at the party-size price with no fee.
  await expect(page.getByRole("heading", { name: "Let us choose the best available table" })).toBeVisible();
  // The page scrolls down to the results instead of jumping back to the top.
  await expect(page.getByRole("heading", { name: "Let us choose the best available table" })).toBeInViewport();

  // Table 1 is a 4-seat Premium table: 2 guests pay for 4 seats plus the fee, explained up front.
  await page.getByRole("button", { name: /^Table 1, 4 seats, Premium, available/ }).click();
  const panel = page.locator("section[aria-live]");
  await expect(panel.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await expect(panel).toContainText("€120.00");
  await expect(panel).toContainText("€50.00");
  await expect(panel).toContainText("€170.00");
  await expect(panel).toContainText("This table seats 4. Because your party has 2, its minimum spend is €120.00.");
  await testInfo.attach("table-selected", { body: await page.screenshot({ fullPage: true, path: shot(testInfo, "selected") }), contentType: "image/png" });
  await page.getByRole("button", { name: "Reserve this table" }).click();

  // Checkout: countdown, summary, details.
  await expect(page.getByRole("timer")).toContainText("Your table is held for");
  await expect(page.getByText("€170.00")).toBeVisible();

  // Another guest now sees the table as being reserved and cannot select it.
  const other = await browser.newPage();
  await search(other, "en", date, 2);
  await expect(other.getByRole("img", { name: /^Table 1, 4 seats, Premium, being reserved/ })).toBeVisible();
  await expect(other.getByRole("button", { name: /^Table 1,/ })).toHaveCount(0);
  await other.close();

  await fillDetails(page);
  await page.getByRole("button", { name: /Pay €170.00/ }).click();

  await expect(page.getByRole("heading", { name: "Your reservation is confirmed" })).toBeVisible();
  await expect(page.getByText("Confirmation number")).toBeVisible();
  await expect(page.getByText(/^CRG-\d+$/)).toBeVisible();
  await expect(page.getByText("If you cancel now you will be refunded €170.00")).toBeVisible();
  await testInfo.attach("confirmed", { body: await page.screenshot({ fullPage: true, path: shot(testInfo, "confirmed") }), contentType: "image/png" });

  // The table is now taken for everyone else, including the overlapping 21:30 slot.
  const later = await browser.newPage();
  await later.goto(`/en/reserve?date=${date}&time=21:30&guests=2`);
  await expect(later.getByRole("img", { name: /^Table 1, 4 seats, Premium, unavailable/ })).toBeVisible();
  await later.close();

  // Cancel more than 24 hours ahead.
  await page.getByText("Cancel reservation", { exact: true }).click();
  await page.getByRole("button", { name: "Yes, cancel my reservation" }).click();
  await expect(page.getByRole("heading", { name: "This reservation was cancelled" })).toBeVisible();

  // And the table is free again.
  await search(page, "en", date, 2);
  await expect(page.getByRole("button", { name: /^Table 1, 4 seats, Premium, available/ })).toBeVisible();
});

test("Greek: automatic assignment for a solo diner is billed as two guests", async ({ page }, testInfo) => {
  await search(page, "el", DATES[testInfo.project.name], 1);
  await expect(page.getByRole("heading", { name: "Κράτηση τραπεζιού" })).toBeVisible();
  const auto = page.locator("section", { hasText: "Αφήστε μας να επιλέξουμε" }).first();
  await expect(auto).toContainText("60,00");
  await expect(auto).toContainText("Η ελάχιστη κράτηση είναι για 2 άτομα");
  await auto.getByRole("button", { name: "Κράτηση χωρίς επιλογή τραπεζιού" }).click();
  await expect(page.getByRole("heading", { name: "Ολοκληρώστε την κράτησή σας" })).toBeVisible();
  await expect(page.getByText("επιλέχθηκε για εσάς")).toBeVisible();
});

test("a party of 12 is offered joined tables with no table fee", async ({ page }, testInfo) => {
  await search(page, "en", DATES[testInfo.project.name], 12);
  const option = page.getByLabel(/Tables 1 \+ 6 \+ 12 \(up to 12 guests\)/);
  await option.check();
  const panel = page.locator("section[aria-live]");
  await expect(panel).toContainText("€360.00");
  await expect(panel).not.toContainText("Table selection fee");
});

test("closed days and unknown links are handled", async ({ page }) => {
  await page.goto("/en/reserve?date=2027-08-09&time=20:00&guests=2");
  await expect(page.getByRole("alert").first()).toContainText("We are closed on that date");
  const response = await page.goto("/en/reservation/not-a-real-token");
  expect(response?.status()).toBe(404);
});

test("language switch keeps the page and the search", async ({ page }, testInfo) => {
  await search(page, "en", DATES[testInfo.project.name], 2);
  await page.getByRole("link", { name: "Ελληνικά" }).click();
  await expect(page).toHaveURL(/\/el\/reserve\?.*guests=2/);
  await expect(page.getByRole("heading", { name: "Διαλέξτε το τραπέζι σας" })).toBeVisible();
});

test("guest moves a paid reservation to another evening without paying again", async ({ page }, testInfo) => {
  const [from, to] = testInfo.project.name === "desktop" ? ["2027-09-14", "16"] : ["2027-09-15", "17"];
  await search(page, "en", from, 2);
  await page.getByRole("button", { name: /^Table 70, 2 seats, Best for Two, available/ }).click();
  await page.getByRole("button", { name: "Reserve this table" }).click();
  await fillDetails(page);
  await page.getByRole("button", { name: /Pay €70.00/ }).click();
  await expect(page.getByRole("heading", { name: "Your reservation is confirmed" })).toBeVisible();

  await page.getByRole("link", { name: "Choose a new date" }).click();
  await expect(page.getByRole("heading", { name: "Move your reservation" })).toBeVisible();
  // The calendar opens on the month of the reservation, and the party size cannot be changed here.
  await expect(page.getByText("September 2027", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Guests" })).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(`${to} September 2027`) }).click();
  await page.getByRole("button", { name: "See available tables" }).click();

  // Their own table is suggested and already selected; a dearer table cannot be picked.
  await expect(page.getByText("Your table 70 is free at that time and is already selected.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Table 1, 4 seats, Premium/ })).toHaveCount(0);
  await expect(page.locator("section[aria-live]")).toContainText("Nothing more to pay.");
  await testInfo.attach("move", { body: await page.screenshot({ fullPage: true, path: shot(testInfo, "move") }), contentType: "image/png" });
  await page.getByRole("button", { name: "Move my reservation here" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Your reservation has been moved." })).toBeVisible();
  await expect(page.getByText(new RegExp(`${to} September 2027`))).toBeVisible();
  await expect(page.getByText("€70.00").first()).toBeVisible();
  await testInfo.attach("moved", { body: await page.screenshot({ fullPage: true, path: shot(testInfo, "moved") }), contentType: "image/png" });

  // The old evening is free again.
  await search(page, "en", from, 2);
  await expect(page.getByRole("button", { name: /^Table 70, 2 seats, Best for Two, available/ })).toBeVisible();
});
