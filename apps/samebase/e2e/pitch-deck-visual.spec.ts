import { expect, test, type Page } from "@playwright/test";
import { PITCH_DECK_SURFACE_TEST_ID } from "../src/components/PitchDeckPage";
import { signInIfNeeded } from "./liveHelpers";

const pitchDeckScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  // The deck uses the app's system sans stack, which renders differently on
  // macOS and Linux. Keep a bounded tolerance until the deck switches to a
  // bundled cross-platform font.
  maxDiffPixelRatio: 0.12,
} as const;

async function signInForPitchRoute(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page);
}

test("/pitch stays visually stable", async ({ page }) => {
  await signInForPitchRoute(page);
  await page.goto("/pitch", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "One route. Two print presets. Zero slide framework.",
  );
  await expect(page.getByRole("link", { name: "Download Desktop PDF" })).toHaveAttribute(
    "href",
    "/pitch-deck.pdf",
  );
  await expect(page.getByRole("link", { name: "Download Mobile PDF" })).toHaveAttribute(
    "href",
    "/pitch-deck-mobile.pdf",
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
    await signInForPitchRoute(page);
    await page.goto(printRoute.route, { waitUntil: "networkidle" });

    await expect(page.getByTestId(PITCH_DECK_SURFACE_TEST_ID)).toHaveScreenshot(
      printRoute.snapshot,
      pitchDeckScreenshotOptions,
    );
  });
}
