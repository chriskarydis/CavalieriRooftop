import { expect, test } from "@playwright/test";

const shot = (name: string): string | undefined => (process.env.SHOTS ? `${process.env.SHOTS}/${name}.png` : undefined);

test("home page presents the restaurant and leads to booking, in both languages", async ({ page }, testInfo) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Dinner above the Old Town");
  await expect(page.getByText("Open 1 May to 10 October")).toBeVisible();
  await expect(page.getByText("Closed on Monday")).toBeVisible();
  await expect(page.getByText("Full refund if you cancel at least 24 hours before.")).toBeVisible();
  await page.screenshot({ fullPage: true, path: shot(`home-${testInfo.project.name}`) });

  const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(data).toMatchObject({ "@type": "Restaurant", name: "Cavalieri Roof Garden", telephone: "+30 26610 39041" });

  await page.getByRole("link", { name: "Choose your table" }).click();
  await expect(page).toHaveURL(/\/en\/reserve$/);

  await page.goto("/el");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Δείπνο πάνω από την Παλιά Πόλη");
  await expect(page.getByText("Κλειστά κάθε Δευτέρα")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "el");
});

test("the root address sends visitors to a language", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(en|el)$/);
});

test("policy page states the live settings; contact and privacy pages load", async ({ page }) => {
  await page.goto("/en/policy");
  await expect(page.getByRole("heading", { level: 1, name: "Reservation policy" })).toBeVisible();
  await expect(page.getByText("A deposit of €30 per person")).toBeVisible();
  await expect(page.getByText("kept for 15 minutes")).toBeVisible();
  await expect(page.getByText("at least 24 hours before your reservation")).toBeVisible();

  await page.goto("/el/contact");
  await expect(page.getByRole("heading", { level: 1, name: "Επικοινωνία" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "+30 26610 39041" })).toBeVisible();

  await page.goto("/en/privacy");
  await expect(page.getByRole("heading", { name: "Cookies", exact: true })).toBeVisible();
});

test("footer links work and no public page links to the management area", async ({ page }) => {
  for (const path of ["/en", "/en/menu", "/en/contact", "/en/policy", "/en/privacy", "/en/reserve"]) {
    await page.goto(path);
    await expect(page.locator('a[href*="manage"]')).toHaveCount(0);
  }
  await page.getByRole("contentinfo").getByRole("link", { name: "Reservation policy" }).click();
  await expect(page).toHaveURL(/\/en\/policy$/);
});

test("sitemap lists public pages only; robots points to it", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/en/menu");
  expect(sitemap).toContain("/el/reserve");
  expect(sitemap).not.toContain("manage");
  expect(sitemap).not.toContain("/reservation/");

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap:");
  expect(robots).not.toContain("manage");
});

test("every public page has one h1, a title and a description", async ({ page }) => {
  for (const path of ["/en", "/el", "/en/menu", "/el/menu", "/en/contact", "/en/policy", "/en/privacy", "/en/reserve"]) {
    await page.goto(path);
    await expect(page.locator("h1"), path).toHaveCount(1);
    expect((await page.title()).length, path).toBeGreaterThan(10);
    await expect(page.locator('meta[name="description"]'), path).toHaveAttribute("content", /.{30,}/);
  }
});
