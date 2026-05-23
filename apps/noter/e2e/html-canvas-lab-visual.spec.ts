import { expect, test } from "@playwright/test";

test("html canvas lab fallback", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/html-canvas", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("html-canvas-lab")).toBeVisible();
  await expect(page.getByText("canvas-draw-element off")).toBeVisible();
  await expect(page).toHaveScreenshot("html-canvas-lab-fallback.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});
