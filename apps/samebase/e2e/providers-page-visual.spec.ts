import { expect, test } from "./visualFixtureTest";

test("providers page connected fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=providers-page-connected", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-connected.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("providers page loading fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=providers-page-loading", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-loading.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("providers page recovery fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 520 });
  await page.goto("/visual-fixture?mode=providers-page-recovery", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-recovery.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});
