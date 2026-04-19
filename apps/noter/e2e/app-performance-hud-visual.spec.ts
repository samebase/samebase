import { devices, expect, test } from "@playwright/test";
import { APP_PERFORMANCE_HUD_TEST_ID } from "@/components/AppPerformanceHud";

const { defaultBrowserType: _defaultBrowserType, ...iPhone13 } =
  devices["iPhone 13"];

test.use(iPhone13);

test("app performance hud fixture renders the mobile monitor", async ({
  page,
}) => {
  await page.goto("/visual-fixture.html?mode=app-performance-hud", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const hud = page.getByTestId(APP_PERFORMANCE_HUD_TEST_ID);
  await expect(hud).toBeVisible();
  await expect(hud).toHaveScreenshot("app-performance-hud-mobile.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
