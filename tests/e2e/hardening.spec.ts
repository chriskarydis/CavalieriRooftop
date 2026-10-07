import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { MANAGER_SESSION } from "./global-setup";

const DATE = "2027-09-09";

/** Serious and critical accessibility problems found by the automated checker. */
async function violations(page: import("@playwright/test").Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(" | ")}`);
}

test("security headers are set on every page", async ({ request }) => {
  const response = await request.get("/en");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-powered-by"]).toBeUndefined();

  const manage = (await request.get("/manage/login")).headers();
  expect(manage["cache-control"]).toContain("no-store");
});

test("pages with a secret link are never cached and send no referrer", async ({ page }) => {
  await page.goto(`/en/reserve?date=${DATE}&time=20:00&guests=2`);
  await page.getByRole("button", { name: /^Table 19, 2 seats, Standard, available/ }).click();
  await page.getByRole("button", { name: "Reserve this table" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  expect(page.url()).toMatch(/\/en\/reserve\/[\w-]{20,}$/);

  const headers = (await page.request.get(page.url())).headers();
  expect(headers["cache-control"]).toContain("no-store");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("unknown addresses show a helpful page in the visitor's language", async ({ page }) => {
  const response = await page.goto("/el/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Η σελίδα δεν βρέθηκε" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Κράτηση τραπεζιού" }).click();
  await expect(page).toHaveURL(/\/el\/reserve$/);
});

test("the cron endpoint refuses callers without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/tick")).status()).toBe(401);
  expect((await request.get("/api/cron/tick", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("the payment webhook refuses unsigned requests", async ({ request }) => {
  const response = await request.post("/api/stripe/webhook", { data: { type: "payment_intent.succeeded" } });
  // 503 while Stripe is not configured, 400 once it is: never accepted.
  expect([400, 503]).toContain(response.status());
});

test.describe("accessibility: public pages", () => {
  for (const path of ["/en", "/el/menu", "/el/gallery", "/en/contact", "/en/policy", "/en/privacy", `/en/reserve?date=${DATE}&time=20:00&guests=2`]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      expect(await violations(page)).toEqual([]);
    });
  }

  test("checkout", async ({ page }) => {
    await page.goto(`/en/reserve?date=${DATE}&time=21:00&guests=2`);
    await page.getByRole("button", { name: /^Table 20, 2 seats, Standard, available/ }).click();
    expect(await violations(page)).toEqual([]);
    await page.getByRole("button", { name: "Reserve this table" }).click();
    await expect(page.getByRole("timer")).toBeVisible();
    expect(await violations(page)).toEqual([]);
  });
});

test.describe("accessibility: management", () => {
  test.use({ storageState: MANAGER_SESSION });
  for (const path of ["/manage", "/manage/reservations", "/manage/timeline", "/manage/analytics", "/manage/tables", "/manage/floor", "/manage/categories", "/manage/combinations", "/manage/menu", "/manage/settings"]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      expect(await violations(page)).toEqual([]);
    });
  }

  test("a walk-in can be given 30 more minutes", async ({ page }) => {
    await page.goto("/manage");
    await page.getByLabel("Name (optional)").fill("Staying longer");
    await page.locator('select[name="tableIds"]').selectOption({ label: "27 (2)" });
    await page.getByRole("button", { name: "Seat walk-in" }).click();
    const row = page.getByRole("row", { name: /Staying longer/ });
    const before = (await row.getByRole("cell").first().textContent()) ?? "";
    await row.getByRole("button", { name: "+30 min" }).click();
    await expect(row.getByRole("cell").first()).not.toHaveText(before);
    await row.getByRole("button", { name: "Release table" }).click();
    await expect(page.getByText("Staying longer")).toHaveCount(0);
  });
});
