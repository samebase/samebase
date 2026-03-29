import { expect, test } from "@playwright/test";

test("fileview mobile sidebar scrim", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  await page
    .getByRole("button", { name: "Toggle Left Sidebar" })
    .press("Enter");
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeLessThanOrEqual(1);
  const scrim = page
    .getByTestId("workspace-sidebar-main-scrim")
    .locator("div")
    .first();

  await expect
    .poll(async () =>
      scrim.evaluate((element) => window.getComputedStyle(element).touchAction),
    )
    .toBe("pan-x");

  await expect(fixture).toHaveScreenshot("fileview-layout-mobile-scrim.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
