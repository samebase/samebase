import { expect, test, type Page } from "@playwright/test";
import { MENGER_SPONGE_VOXEL_STATE } from "@samebase/logo-model/voxel";

test.setTimeout(120_000);
test.describe.configure({ mode: "serial" });

const expectedLayerCounts = {
  2: "1,20",
  3: "1,20,400",
  4: "1,20,400,8000",
} as const;

async function advanceToRecursiveShuffleMidpoint(page: Page): Promise<number> {
  const canvas = page.getByTestId("logo-preview-scene").locator("canvas");

  for (let step = 0; step < 100; step += 1) {
    await page.clock.runFor(25);
    const progress = Number(await canvas.getAttribute("data-logo-recursive-move-progress"));
    if (progress >= 0.48 && progress <= 0.53) {
      return progress;
    }
  }

  throw new Error("The recursive logo shuffle did not reach its midpoint.");
}

for (const depth of [2, 3, 4] as const) {
  test(`logo depth ${depth} repeats one shuffle move at every recursive scale`, async ({
    page,
  }) => {
    await page.clock.install({ time: 1_000 });
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(
      `/logo?auto-shuffle&depth=${depth}&elev=35&rot=45&shuffleMoves=1&vox=${encodeURIComponent(
        MENGER_SPONGE_VOXEL_STATE,
      )}`,
      { waitUntil: "domcontentloaded" },
    );

    const canvas = page.getByTestId("logo-preview-scene").locator("canvas");
    await expect(canvas).toBeVisible();
    const runningClockTime = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(runningClockTime + 1_000);
    const progress = await advanceToRecursiveShuffleMidpoint(page);

    await expect(canvas).toHaveAttribute("data-logo-recursive-move-depth", `${depth}`);
    await expect(canvas).toHaveAttribute(
      "data-logo-recursive-move-layer-counts",
      expectedLayerCounts[depth],
    );
    await expect(canvas).toHaveAttribute("data-logo-recursive-move-from", /^\d,\d,\d$/u);
    await expect(canvas).toHaveAttribute("data-logo-recursive-move-to", /^\d,\d,\d$/u);
    expect(progress).toBeGreaterThanOrEqual(0.48);
    expect(progress).toBeLessThanOrEqual(0.53);

    await expect(canvas).toHaveScreenshot(`logo-depth-${depth}-recursive-shuffle-midpoint.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.01,
      scale: "css",
      timeout: 60_000,
    });
  });
}
