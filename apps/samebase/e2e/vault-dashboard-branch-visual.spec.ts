import { expect, test } from "./visualFixtureTest";

test("vault pull request list with settled observations", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/visual-fixture?mode=vault-pull-request-list-settled", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-pull-request-list-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-pull-request-list-settled.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});

test("vault pull request list with operational states", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 1600 });
  await page.goto("/visual-fixture?mode=vault-pull-request-list-operational-states", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-pull-request-list-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-pull-request-list-operational-states.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
