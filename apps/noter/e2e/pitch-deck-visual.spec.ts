import { expect, test } from "@playwright/test";
import { PITCH_DECK_SURFACE_TEST_ID } from "../src/components/PitchDeckPage";

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
      {
        animations: "disabled",
        caret: "hide",
        scale: "css",
      },
    );
  });
}
