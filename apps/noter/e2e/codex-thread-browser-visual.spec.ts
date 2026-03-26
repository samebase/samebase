import { expect, test, type Page } from "@playwright/test";

async function openBrowserFixture(page: Page) {
  await page.goto("/visual-fixture.html?mode=codex-thread-browser", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

test("codex thread browser visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 1400 });
  await openBrowserFixture(page);
  await expect(
    page.getByTestId("codex-thread-browser-visual-fixture"),
  ).toHaveScreenshot("codex-thread-browser.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0,
    maxDiffPixels: 0,
  });
});

test("codex thread browser visual fixture half screen", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1400 });
  await openBrowserFixture(page);
  await expect(
    page.getByTestId("codex-thread-browser-visual-fixture"),
  ).toHaveScreenshot("codex-thread-browser-half-screen.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0,
    maxDiffPixels: 0,
  });
});
