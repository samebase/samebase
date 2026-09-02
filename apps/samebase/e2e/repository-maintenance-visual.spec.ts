import { expect, test } from "./visualFixtureTest";

const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0,
  maxDiffPixels: 0,
} as const;

test("repository maintenance page", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/visual-fixture?mode=repository-maintenance", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const maintenancePage = page.getByTestId("repository-maintenance-page");
  await expect(maintenancePage).toBeVisible();
  await expect(maintenancePage).toHaveScreenshot(
    "repository-maintenance.png",
    strictScreenshotOptions,
  );
});
