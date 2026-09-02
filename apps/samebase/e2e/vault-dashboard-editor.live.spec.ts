import { expect, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

test.describe("vault overview editor live flow", () => {
  test.setTimeout(90_000);

  test("overview Files link opens the editor route", async ({ page }) => {
    await page.goto("/repo");
    await signInIfNeeded(page, "/repo");
    const firstVaultLink = page
      .getByRole("navigation", { name: "Repositories" })
      .getByRole("link")
      .first();
    await expect(firstVaultLink).toBeVisible({ timeout: 20_000 });
    await firstVaultLink.click();
    await expect(page).toHaveURL(/\/repo\/[^/]+\/[^/?#]+(?:[?#]|$)/);

    const filesLink = page.getByRole("link", { name: "Files", exact: true }).first();
    await expect(filesLink).toBeVisible({ timeout: 20_000 });

    await filesLink.click();
    await expect(page).toHaveURL(/\/repo\/.+/);
    await expect(page.getByText("Samebase could not finish loading.")).toHaveCount(0);
    await expect(page.locator("h2").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("textbox").first()).toBeVisible({ timeout: 20_000 });
  });
});
