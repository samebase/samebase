import { expect, test } from "@playwright/test";

test.use({
  hasTouch: true,
  isMobile: true,
});

test("editable ProseMark mobile drag fixture", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/visual-fixture.html?mode=fileview-prosemark-drag-editable",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-prosemark-drag-visual-fixture");

  await expect(fixture).toHaveScreenshot(
    "fileview-prosemark-drag-editable.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});
