import { expect, test } from "@playwright/test";

test("@diagnostic codex thread history visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1480, height: 1600 });
  await page.goto("/visual-fixture?mode=codex-thread-history", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("codex-thread-history-visual-fixture")).toHaveScreenshot(
    "codex-thread-history.png",
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
