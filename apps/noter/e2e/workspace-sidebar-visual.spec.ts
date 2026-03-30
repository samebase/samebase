import { expect, test } from "@playwright/test";

test("fileview desktop left header with right tree", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=fileview-layout", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Toggle Left Sidebar" }).click();

  await expect(
    page.getByTestId("fileview-layout-visual-fixture"),
  ).toHaveScreenshot("fileview-layout-left-header-right-tree.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("fileview mobile sidebar scrim", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=fileview-layout-persistence", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const initialScrollLeft = await fixture.evaluate(
    (element) => element.scrollLeft,
  );
  await page
    .getByRole("button", { name: "Toggle Right Sidebar" })
    .press("Enter");
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(initialScrollLeft);
  const scrim = page
    .getByTestId("workspace-sidebar-main-scrim")
    .locator("div")
    .first();
  const header = page.getByTestId("fileview-layout-header");

  await expect
    .poll(async () =>
      scrim.evaluate((element) => window.getComputedStyle(element).touchAction),
    )
    .toBe("pan-x");
  await expect
    .poll(async () =>
      header.evaluate(
        (element) => window.getComputedStyle(element).scrollSnapStop,
      ),
    )
    .toBe("always");

  await expect(fixture).toHaveScreenshot("fileview-layout-mobile-scrim.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
