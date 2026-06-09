import { expect, test, type Page } from "./visualFixtureTest";

async function openBrowserFixture(page: Page) {
  await page.goto("/visual-fixture?mode=codex-thread-browser", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

test("codex thread browser visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1480, height: 1600 });
  await openBrowserFixture(page);
  await expect(page.getByTestId("codex-thread-browser-visual-fixture")).toHaveScreenshot(
    "codex-thread-browser.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      // The fixture is text-heavy enough that Linux and macOS wrap a few lines
      // differently, so keep the snapshot shared but allow small cross-platform
      // typography drift.
      maxDiffPixelRatio: 0.06,
    },
  );
});
