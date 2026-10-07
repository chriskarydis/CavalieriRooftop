import { expect, test, type Page } from "@playwright/test";
import { DEVELOPER_SESSION, MANAGER_SESSION } from "./global-setup";

const NEW_MANAGER = { name: "Nikos Newhire", email: "nikos@e2e.test", first: "first-password-123", own: "my-own-password-456" };

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/manage/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("as a manager", () => {
  test.use({ storageState: MANAGER_SESSION });

  test("the staff page is neither linked nor reachable", async ({ page }) => {
    await page.goto("/manage");
    await page.getByRole("button", { name: "Setup" }).click();
    await expect(page.getByRole("link", { name: /^Staff/ })).toHaveCount(0);
    await page.goto("/manage/staff");
    await expect(page.getByRole("heading", { name: "Staff accounts" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
  });
});

test.describe("as a developer", () => {
  test.use({ storageState: DEVELOPER_SESSION });

  test("creates a manager, who signs in, changes their own password, and is later removed", async ({ page, browser }) => {
    await page.goto("/manage");
    await page.getByRole("button", { name: "Setup" }).click();
    await page.getByRole("link", { name: /^Staff/ }).click();
    await expect(page.getByRole("heading", { name: "Staff accounts" })).toBeVisible();

    await page.getByLabel("Name", { exact: true }).fill(NEW_MANAGER.name);
    await page.getByLabel("Email", { exact: true }).fill(NEW_MANAGER.email);
    await page.getByLabel("First password (at least 12 characters)").fill(NEW_MANAGER.first);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toContainText("Saved.");
    const entry = page.getByRole("listitem").filter({ hasText: NEW_MANAGER.email });
    await expect(entry).toContainText("Manager");

    // The same email cannot be used twice.
    await page.getByLabel("Name", { exact: true }).fill("Somebody Else");
    await page.getByLabel("Email", { exact: true }).fill(NEW_MANAGER.email);
    await page.getByLabel("First password (at least 12 characters)").fill("another-password-789");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("That already exists.");

    // The new manager signs in and sets a password only they know.
    const context = await browser.newContext({ storageState: undefined });
    const theirs = await context.newPage();
    await signIn(theirs, NEW_MANAGER.email, NEW_MANAGER.first);
    await expect(theirs.getByRole("heading", { name: "Live floor" })).toBeVisible();
    await theirs.getByRole("link", { name: `${NEW_MANAGER.name} · Manager` }).click();
    await theirs.getByLabel("Current password").fill("not-the-password");
    await theirs.getByLabel("New password (at least 12 characters)").fill(NEW_MANAGER.own);
    await theirs.getByLabel("New password again").fill(NEW_MANAGER.own);
    await theirs.getByRole("button", { name: "Change password" }).click();
    await expect(theirs.getByRole("main").getByRole("alert")).toContainText("The current password is not correct.");

    await theirs.getByLabel("Current password").fill(NEW_MANAGER.first);
    await theirs.getByLabel("New password (at least 12 characters)").fill(NEW_MANAGER.own);
    await theirs.getByLabel("New password again").fill(NEW_MANAGER.own);
    await theirs.getByRole("button", { name: "Change password" }).click();
    await expect(theirs.getByRole("status")).toContainText("Password changed.");

    // Removing the account signs them out at once.
    await page.reload();
    const removable = page.getByRole("listitem").filter({ hasText: NEW_MANAGER.email });
    await removable.getByText("Remove", { exact: true }).click();
    await removable.getByRole("button", { name: `Remove ${NEW_MANAGER.name}` }).click();
    await expect(page.getByText(NEW_MANAGER.email)).toHaveCount(0);

    await theirs.goto("/manage");
    await expect(theirs).toHaveURL(/\/manage\/login$/);
    await signIn(theirs, NEW_MANAGER.email, NEW_MANAGER.own);
    await expect(theirs.getByRole("alert").first()).toContainText("The email or password is incorrect.");
    await context.close();
  });

  test("cannot remove themselves or stop being the only developer", async ({ page }) => {
    await page.goto("/manage/staff");
    const me = page.getByRole("listitem").filter({ hasText: "developer@e2e.test" });
    await expect(me).toContainText("you");
    await expect(me.getByText("Remove", { exact: true })).toHaveCount(0);

    await me.getByLabel("Role").selectOption("MANAGER");
    await me.getByRole("button", { name: "Change role" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("This is the only developer account.");
  });
});
