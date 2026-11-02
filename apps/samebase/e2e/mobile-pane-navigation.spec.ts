import { devices, expect, test, type Page } from "@playwright/test";

import {
  applyOrganizationContextAcceptanceFixture,
  createOrganizationContextAcceptanceAccount,
} from "./organizationContextAcceptance";

test.use(devices["Pixel 7"]);

function workspace(page: Page) {
  return page.locator('[data-sidebar-layout-part="viewport"]');
}

async function swipeToPane(page: Page, side: "left" | "right") {
  await page.locator('[data-sidebar-layout-part="carousel"]').evaluate((carousel, target) => {
    carousel.scrollLeft = target === "left" ? 0 : carousel.scrollWidth;
  }, side);
  await expect(workspace(page)).toHaveAttribute("data-mobile-pane", side);
}

/**
The panes hold their position through every route change, while Back still restores the scroll
position inside the main pane. Without `data-scroll-restoration-ignore` on the carousel, the router
writes back the carousel position of the history entry. Back shows that without a slow route.
*/
test("a navigation keeps the mobile pane that the user swiped to", async ({ page }, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const email = `mobile-pane-${suffix}@example.com`;
  const ownerLogin = `org-context-mobile-pane-${suffix}`;

  await createOrganizationContextAcceptanceAccount(page, email);
  await applyOrganizationContextAcceptanceFixture({
    email,
    organizations: [{ access: "retain", ownerLogin, repositories: ["first-app", "second-app"] }],
  });
  await page.goto(`/repo/${ownerLogin}/first-app`, { waitUntil: "domcontentloaded" });
  const mainPane = page.locator('[data-sidebar-layout-part="pane-surface"]');
  await expect(mainPane).toContainText(`${ownerLogin}/first-app`);

  await swipeToPane(page, "left");
  await page.getByRole("link", { name: "second-app" }).first().click();
  await expect(mainPane).toContainText(`${ownerLogin}/second-app`);
  await expect(workspace(page)).toHaveAttribute("data-mobile-pane", "left");

  await swipeToPane(page, "right");
  await page.goBack();
  await expect(mainPane).toContainText(`${ownerLogin}/first-app`);
  await expect(workspace(page)).toHaveAttribute("data-mobile-pane", "right");
});
