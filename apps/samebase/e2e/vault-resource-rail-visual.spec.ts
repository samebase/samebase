import { expect, test } from "./visualFixtureTest";

test("vault resource rail fixture", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 1520 });
  await page.goto("/visual-fixture?mode=vault-resource-rail", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-resource-rail-visual-fixture");
  await expect(fixture.getByText("nicu/tmp-my-new-app")).toHaveCount(4);
  await expect(fixture.getByText("nicuchiciuc/tmp-my-new-app")).toHaveCount(1);
  await expect(fixture.getByText("nicu-chiciuc/weight_tsx")).toBeInViewport();
  await expect(fixture).toHaveScreenshot("vault-resource-rail.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
