import { expect, test } from "@playwright/test";

test("commit graph fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1760, height: 1040 });
  await page.goto("/visual-fixture.html?mode=commit-graph", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("commit-graph-visual-fixture");
  await expect(fixture).toHaveScreenshot("commit-graph.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
