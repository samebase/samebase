import { expect, test } from "./visualFixtureTest";

test("connect organization installation states", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/visual-fixture?mode=connect-organization-page", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("connect-organization-page")).toHaveScreenshot(
    "connect-organization-page.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.001,
      scale: "css",
    },
  );
});
