import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "media-png",
    snapshotName: "repository-media-png.png",
  },
  {
    mode: "media-svg",
    snapshotName: "repository-media-svg.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`repository media fixture (${scenario.mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/visual-fixture.html?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });

    const image = page.getByTestId("repository-media-preview-panel-image");

    await expect(image).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await image.evaluate(async (element) => {
      if (!(element instanceof HTMLImageElement)) {
        return;
      }

      if (!element.complete) {
        await new Promise<void>((resolve) => {
          element.addEventListener("load", () => resolve(), { once: true });
          element.addEventListener("error", () => resolve(), { once: true });
        });
      }

      if (typeof element.decode === "function") {
        try {
          await element.decode();
        } catch {
          // Some browsers reject decode() for already-decoded or SVG images.
        }
      }
    });
    const screenshot = await page.screenshot({
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
    expect(screenshot).toMatchSnapshot(scenario.snapshotName, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
