import { expect, test } from "./visualFixtureTest";

test("vault resource rail fixture", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 1520 });
  await page.goto("/visual-fixture?mode=vault-resource-rail", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-resource-rail-visual-fixture");
  await expect(fixture.getByText("samebase/loading-provider-data")).toBeVisible();
  await expect(fixture.getByText("samebase/provider-errors")).toBeVisible();
  await expect(fixture.getByText("samebase/existing-repository")).toBeInViewport();
  await expect(fixture.getByText("Preview URL disabled.")).toBeVisible();
  await expect(fixture).toHaveScreenshot("vault-resource-rail.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
