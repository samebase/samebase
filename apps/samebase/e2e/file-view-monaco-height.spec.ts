import { expect, test } from "@playwright/test";
import { seedVisualFixtureWorkspaceSidebarState } from "./visualFixtureTest";

/** This fixture was designed with both sidebars open, so it does not follow the first-visit default. */
test.beforeEach(async ({ page }) => {
  await seedVisualFixtureWorkspaceSidebarState(page, {
    leftDesktopOpen: true,
    rightDesktopOpen: true,
  });
});

test("Monaco keeps visible lines in the file-view flex-height layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture?mode=fileview-monaco-flex-height", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const surface = page.getByTestId("fileview-monaco-height-surface");
  await expect(surface.locator(".monaco-editor .view-lines")).toBeVisible();

  const fixture = page.getByTestId("fileview-monaco-height-visual-fixture");
  await expect(fixture).toHaveScreenshot("fileview-monaco-flex-height.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
