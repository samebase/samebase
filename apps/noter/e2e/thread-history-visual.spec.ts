import { expect, test } from "@playwright/test";

test.use({
  locale: "en-US",
  timezoneId: "UTC",
});

test("thread history visual fixture", async ({ page }) => {
  await page.goto("/visual-fixture.html?mode=thread-history", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByTestId("thread-history-visual-fixture"),
  ).toHaveScreenshot("thread-history.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0,
    maxDiffPixels: 0,
  });
});
