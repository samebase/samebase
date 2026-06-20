import { expect, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

test.describe("vault dashboard editor live flow", () => {
  test.setTimeout(90_000);

  test("dashboard Edit link opens the editor route", async ({ page }) => {
    await page.goto("/home");
    await signInIfNeeded(page, "/home");

    const editLink = page.getByRole("link", { name: "Edit" }).first();
    await expect(editLink).toBeVisible({ timeout: 20_000 });

    await editLink.click();
    await expect(page).toHaveURL(/\/vault\/.+/);
    await expect(page.getByText("Samebase could not finish loading.")).toHaveCount(0);
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("textbox").first()).toBeVisible({ timeout: 20_000 });
  });
});
