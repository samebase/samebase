import { expect, test } from "@playwright/test";
import { PITCH_DECK_SURFACE_TEST_ID } from "../src/components/PitchDeckPage";

test("pitch deck print route stays visually stable", async ({ page }) => {
  await page.goto("/pitch/print", { waitUntil: "networkidle" });

  await expect(page.getByTestId(PITCH_DECK_SURFACE_TEST_ID)).toHaveScreenshot(
    "pitch-deck-print.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  );
});
