import { expect, test } from "@playwright/test";

test("daytona snapshot list fixture (stop retries)", async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 300 });
  await page.goto("/visual-fixture.html?mode=daytona-snapshot-list-stop", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("daytona-snapshot-list-visual-fixture");
  await expect(fixture).toHaveScreenshot("daytona-snapshot-list-stop.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
