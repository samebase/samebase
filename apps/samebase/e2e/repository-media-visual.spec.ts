import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "media-png",
    previewKind: "image",
    snapshotName: "repository-media-png.png",
  },
  {
    mode: "media-svg",
    previewKind: "image",
    snapshotName: "repository-media-svg.png",
  },
  {
    mode: "media-vox",
    previewKind: "vox",
    snapshotName: "repository-media-vox.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`repository media fixture (${scenario.mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/visual-fixture?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });

    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    if (scenario.previewKind === "image") {
      const image = page.getByTestId("repository-media-preview-panel-image");

      await expect(image).toBeVisible();
      await image.evaluate(async (element) => {
        if (!(element instanceof HTMLImageElement)) {
          return;
        }

        if (!element.complete) {
          await new Promise<void>((resolve, reject) => {
            element.addEventListener("load", () => resolve(), { once: true });
            element.addEventListener(
              "error",
              () => reject(new Error("Failed to load repository media fixture image.")),
              { once: true },
            );
          });
        }

        if (element.naturalWidth === 0) {
          throw new Error("Repository media fixture image failed to decode.");
        }

        if (typeof element.decode === "function") {
          try {
            await element.decode();
          } catch {
            // Some browsers reject decode() for already-decoded or SVG images.
          }
        }
      });
    } else {
      const voxViewer = page.getByTestId("repository-media-preview-panel-vox-viewer");
      const voxCanvas = page.getByTestId("repository-media-preview-panel-vox-canvas");

      await expect(voxViewer).toHaveAttribute("data-state", "ready");
      await expect(voxCanvas).toBeVisible();
    }

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
