import { expect, test, type Page } from "@playwright/test";

const FIXED_NOW = Date.UTC(2026, 2, 26, 16, 20, 0);

test.use({
  locale: "en-US",
  timezoneId: "UTC",
});

async function openBrowserFixture(page: Page) {
  await page.addInitScript((fixedNow) => {
    Date.now = () => fixedNow;
  }, FIXED_NOW);

  await page.goto("/visual-fixture.html?mode=thread-browser", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

test("thread browser visual fixture", async ({ page }) => {
  await openBrowserFixture(page);
  await expect(
    page.getByTestId("thread-browser-visual-fixture"),
  ).toHaveScreenshot("thread-browser.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0,
    maxDiffPixels: 0,
  });
});
