import { expect, test } from "@playwright/test";

test("vault dashboard branch fixture (pr title)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/visual-fixture?mode=vault-dashboard-branch-pr-title", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-branch-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-dashboard-branch-pr-title.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
