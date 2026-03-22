import { expect, test } from "@playwright/test";

test("dashboard fixture matches sidebar visual states", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture.html?mode=dashboard-sidebar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("dashboard-visual-fixture");
  const desktopSidebar = fixture.locator('[data-variant="sidebar"]').first();

  await expect(page).toHaveScreenshot("dashboard-sidebar-expanded.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });

  await page.getByRole("button", { name: "Providers" }).click();
  await expect(page).toHaveScreenshot("dashboard-sidebar-providers-open.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });

  await page.getByRole("button", { name: "Providers" }).click();
  await page.getByRole("button", { name: "New Project" }).click();
  await expect(page).toHaveScreenshot(
    "dashboard-sidebar-new-project-open.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.01,
    },
  );

  await page.getByRole("button", { name: "New Project" }).click();

  await fixture.getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect(desktopSidebar).toHaveAttribute("data-state", "collapsed");

  await expect(page).toHaveScreenshot("dashboard-sidebar-collapsed.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
