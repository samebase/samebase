import { expect, test } from "@playwright/test";
import { PITCH_DECK_SURFACE_TEST_ID } from "../src/components/PitchDeckPage";

const pitchDeckScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  // The deck uses the app's system sans stack, which renders differently on
  // macOS and Linux. Keep a bounded tolerance until the deck switches to a
  // bundled cross-platform font.
  maxDiffPixelRatio: 0.12,
} as const;

test("/pitch stays visually stable", async ({ page }) => {
  await page.goto("/pitch", { waitUntil: "networkidle" });

  await expect(page.getByTestId(PITCH_DECK_SURFACE_TEST_ID)).toHaveScreenshot(
    "pitch-deck-interactive.png",
    pitchDeckScreenshotOptions,
  );
});

const printRoutes = [
  {
    route: "/pitch/print",
    snapshot: "pitch-deck-print.png",
  },
  {
    route: "/pitch/print/mobile",
    snapshot: "pitch-deck-print-mobile.png",
  },
] as const;

for (const printRoute of printRoutes) {
  test(`${printRoute.route} stays visually stable`, async ({ page }) => {
    await page.goto(printRoute.route, { waitUntil: "networkidle" });

    await expect(page.getByTestId(PITCH_DECK_SURFACE_TEST_ID)).toHaveScreenshot(
      printRoute.snapshot,
      pitchDeckScreenshotOptions,
    );
  });
}
