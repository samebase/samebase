import { expect, test } from "@playwright/test";

test("codex thread browser visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 1400 });
  await page.goto("/visual-fixture.html?mode=codex-thread-browser", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

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
