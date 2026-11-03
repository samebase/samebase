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

/**
A phone paints the server HTML well before React hydrates. A swipe in that time wins over the saved
pane, so hydration must not move the user. Holding the scripts makes that time as long as the test
needs.
*/
test("hydration keeps the mobile pane that the user swiped to", async ({ page }, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const email = `mobile-pane-hydration-${suffix}@example.com`;
  const ownerLogin = `org-context-mobile-pane-hydration-${suffix}`;

  await createOrganizationContextAcceptanceAccount(page, email);
  await applyOrganizationContextAcceptanceFixture({
    email,
    organizations: [{ access: "retain", ownerLogin, repositories: ["first-app"] }],
  });

  let releaseScripts = () => {};
  const scriptsReleased = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") {
      await scriptsReleased;
    }
    await route.fallback();
  });
  await page.goto(`/repo/${ownerLogin}/first-app`, { waitUntil: "commit" });
  const carousel = page.locator('[data-sidebar-layout-part="carousel"]');
  await expect(page.locator('[data-pane-side="right"]')).toBeAttached();

  // The server HTML has the real layout, so a scroll position means the same before and after
  // hydration. The main pane is on screen with the left pane to its left.
  const mainPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="main"]');
  await expect
    .poll(() =>
      mainPane.evaluate(
        (element) =>
          element.getBoundingClientRect().left +
          element.parentElement!.scrollLeft -
          element.offsetLeft,
      ),
    )
    .toBe(0);
  expect(await mainPane.evaluate((element) => element.offsetLeft)).toBeGreaterThan(0);

  await carousel.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  releaseScripts();

  await expect(carousel).toHaveAttribute("data-viewport-measured", "");
  await expect(workspace(page)).toHaveAttribute("data-mobile-pane", "right");
  await expect
    .poll(() =>
      carousel.evaluate(
        (element) => element.scrollWidth - element.clientWidth - element.scrollLeft,
      ),
    )
    .toBe(0);
});
