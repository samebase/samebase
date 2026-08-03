import { expect, test } from "./visualFixtureTest";

test("connect repository loading more status", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.goto("/visual-fixture?mode=connect-repository-loading-more", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const loadingMore = page.getByTestId("connect-repository-loading-more");
  await expect(loadingMore).toHaveText("Loading more repositories...");
  await expect(loadingMore).toHaveScreenshot("connect-repository-loading-more.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
});
