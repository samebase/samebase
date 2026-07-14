import { expect, test } from "./visualFixtureTest";

test("file view compare split preview responds to pane width", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture?mode=file-view-compare-sidebar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("file-view-compare-visual-fixture");
  const card = page.getByTestId("file-view-compare-visual-card");
  const previewPane = page.getByTestId("file-view-compare-preview-pane");
  const beforePanel = page.getByText("Before", { exact: true }).locator("..");
  const afterPanel = page.getByText("After", { exact: true }).locator("..");

  await card.evaluate((element) => {
    element.style.width = "900px";
    element.style.maxWidth = "none";
  });
  await expect
    .poll(async () => (await previewPane.boundingBox())?.width ?? Infinity)
    .toBeLessThan(768);
  await expect
    .poll(async () => {
      const [beforeBox, afterBox] = await Promise.all([
        beforePanel.boundingBox(),
        afterPanel.boundingBox(),
      ]);
      if (beforeBox === null || afterBox === null) {
        return false;
      }

      return afterBox.y >= beforeBox.y + beforeBox.height;
    })
    .toBe(true);
  // The dense read-only diff surface picks up small Chromium rasterization
  // differences between local macOS previews and Linux CI builds.
  await expect(fixture).toHaveScreenshot("file-view-compare-sidebar.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.02,
    timeout: 15_000,
  });

  await card.evaluate((element) => {
    element.style.width = "1280px";
    element.style.maxWidth = "none";
  });
  await expect.poll(async () => (await previewPane.boundingBox())?.width ?? 0).toBeGreaterThan(768);
  await expect
    .poll(async () => {
      const [beforeBox, afterBox] = await Promise.all([
        beforePanel.boundingBox(),
        afterPanel.boundingBox(),
      ]);
      if (beforeBox === null || afterBox === null) {
        return false;
      }

      return Math.abs(afterBox.y - beforeBox.y) <= 1 && afterBox.x >= beforeBox.x + beforeBox.width;
    })
    .toBe(true);
  await expect(fixture).toHaveScreenshot("file-view-compare-sidebar-wide.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.02,
    timeout: 15_000,
  });
});

test("file view compare loading fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture?mode=file-view-compare-loading", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("file-view-compare-visual-fixture")).toHaveScreenshot(
    "file-view-compare-loading.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02,
      timeout: 15_000,
    },
  );
});
