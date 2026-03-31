import { expect, test } from "@playwright/test";

test("app page scroll shell fixture", async ({ page }) => {
  await page.goto("/visual-fixture.html?mode=app-page-scroll-shell", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("app-page-scroll-shell-visual-fixture");
  await fixture.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("Expected AppPageScrollShell fixture root");
    }

    element.scrollTop = 220;
  });
  await expect
    .poll(async () => {
      return await fixture.evaluate((element) => {
        if (!(element instanceof HTMLElement)) {
          throw new Error("Expected AppPageScrollShell fixture root");
        }

        return element.scrollTop;
      });
    })
    .toBe(220);

  await expect(fixture).toHaveScreenshot("app-page-scroll-shell.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
