import { expect, test } from "./visualFixtureTest";

test("Samebase attribution size, alignment, and inherited color", async ({ page }) => {
  await page.goto("/visual-fixture?mode=samebase-attribution", {
    waitUntil: "networkidle",
  });
  const fixture = page.getByTestId("samebase-attribution-visual-fixture");
  await expect(fixture).toHaveScreenshot("samebase-attribution.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixels: 0,
  });

  await fixture.getByRole("link").first().hover();
  await expect(fixture.getByRole("link").first()).toHaveScreenshot(
    "samebase-attribution-hover.png",
    { animations: "disabled", caret: "hide", scale: "css", maxDiffPixels: 0 },
  );
});
