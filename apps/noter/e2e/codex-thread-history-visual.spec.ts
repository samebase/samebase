import { expect, test } from "@playwright/test";

test("codex thread history visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1480, height: 1600 });
  await page.goto("/visual-fixture.html?mode=codex-thread-history", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByTestId("codex-thread-history-visual-fixture"),
  ).toHaveScreenshot("codex-thread-history.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0,
    maxDiffPixels: 0,
  });
});
