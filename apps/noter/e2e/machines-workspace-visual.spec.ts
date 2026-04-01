import { expect, test } from "@playwright/test";

test("machines workspace fixture", async ({ page }) => {
  await page.goto("/visual-fixture.html?mode=machines-workspace", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("machines-workspace-visual-fixture");
  await expect(fixture).toHaveScreenshot("machines-workspace-page.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
