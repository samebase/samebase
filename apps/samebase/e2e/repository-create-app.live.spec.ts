import { expect, type Page, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

async function openOrganizationOnboardingRoute(
  page: Page,
  args: { linkName: "Connect repository" | "New app"; route: "connect-repo" | "new-app" },
): Promise<void> {
  await page.goto("/repo?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/repo?dev");

  const contextControl = page.getByTestId("organization-context-control");
  await contextControl.getByRole("button", { name: /Switch organization/ }).click();
  const organizationOption = page.getByRole("menuitem").nth(1);
  await expect(organizationOption).toBeVisible();
  await organizationOption.click();
  await expect(page).toHaveURL(/\/org\/[^/]+\/repositories(?:[?#]|$)/);

  await page
    .getByRole("navigation", { name: "Organization" })
    .getByRole("link", { exact: true, name: args.linkName })
    .click();
  await expect(page).toHaveURL(new RegExp(`/org/[^/]+/${args.route}(?:[?#]|$)`));
}

test.describe("repository create app live flow", () => {
  test("shows the new app form without a cancel control", async ({ page }) => {
    await openOrganizationOnboardingRoute(page, { linkName: "New app", route: "new-app" });

    const newAppPage = page.getByTestId("new-app-page");
    await expect(newAppPage).toBeVisible();
    await expect(newAppPage.getByRole("button", { name: "New App" })).toBeVisible();
    await expect(newAppPage.getByRole("button", { exact: true, name: "Cancel" })).toHaveCount(0);
    await expect(newAppPage.getByRole("link", { exact: true, name: "Cancel" })).toHaveCount(0);
  });
});
