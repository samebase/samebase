import { expect, test, type Page } from "@playwright/test";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
} from "../src/components/logoStaticSvgContract";
import {
  PUBLIC_LANDING_LOGO_DIAGONAL_ROTATION_SNAP_DEGREES,
  PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ROTATION_SNAP_DEGREES,
} from "../src/lib/publicLandingLogo";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

test.use({ serviceWorkers: "block" });

const MAX_PARITY_MISMATCH_PIXELS = 20_000;
const MAX_ANGLE_PARITY_DIFF_PIXEL_RATIO = 0.01;

const ANGLE_PARITY_CASES = [
  {
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    name: "default-isometric",
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
  },
  ...PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ROTATION_SNAP_DEGREES.map(
    (rotationDegrees) => ({
      elevationDegrees: 0,
      name: `orthographic-rot-${rotationDegrees}`,
      rotationDegrees,
    }),
  ),
  ...PUBLIC_LANDING_LOGO_DIAGONAL_ROTATION_SNAP_DEGREES.map(
    (rotationDegrees) => ({
      elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
      name: `diagonal-rot-${rotationDegrees}`,
      rotationDegrees,
    }),
  ),
] as const;

async function openLogoThreeFixtureAtAngle(
  page: Page,
  {
    elevationDegrees,
    rotationDegrees,
  }: {
    elevationDegrees: number;
    rotationDegrees: number;
  },
) {
  await page.goto(
    `/visual-fixture.html?mode=logo-three-reference&rotation=${encodeURIComponent(
      rotationDegrees,
    )}&elevation=${encodeURIComponent(elevationDegrees)}`,
    {
      waitUntil: "domcontentloaded",
    },
  );

  const fixture = page.getByTestId("logo-three-visual-fixture");
  const reference = page.getByTestId("logo-three-parity-reference");
  const referenceCanvas = reference.locator("canvas");
  const image = page.getByTestId("logo-three-parity-svg");
  const svgFrame = page.getByTestId("logo-three-parity-svg-frame");
  const diffCanvas = page.getByTestId("logo-three-parity-diff");

  await expect(fixture).toBeVisible();
  await expect(reference).toBeVisible();
  await expect(referenceCanvas).toBeVisible();
  await expect(image).toBeVisible();
  await expect(svgFrame).toBeVisible();
  await expect(diffCanvas).toBeVisible();
  await expect(fixture).toHaveAttribute("data-compare-ready", "true");

  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });

  return {
    diffCanvas,
    fixture,
    image,
    reference,
    referenceCanvas,
    svgFrame,
  };
}

test("logo three reference fixture", async ({ page }) => {
  await page.setViewportSize({ width: 3400, height: 2600 });
  const { diffCanvas, fixture } = await openLogoThreeFixtureAtAngle(page, {
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
  });
  const mismatchCount = page.getByTestId("logo-three-parity-mismatch-count");

  await expect
    .poll(async () => {
      const textContent = await mismatchCount.textContent();
      const mismatchMatch = textContent?.match(/([\d,]+) mismatched pixels/);
      if (!mismatchMatch) {
        return null;
      }

      return Number(mismatchMatch[1].replaceAll(",", ""));
    })
    .toBeLessThanOrEqual(MAX_PARITY_MISMATCH_PIXELS);

  await expect(fixture).toHaveScreenshot("logo-three-reference.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });

  await expect(diffCanvas).toHaveScreenshot("logo-three-diff.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});

for (const angleCase of ANGLE_PARITY_CASES) {
  test(`logo three/svg angle parity ${angleCase.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 3400, height: 2600 });
    const { reference, svgFrame } = await openLogoThreeFixtureAtAngle(
      page,
      angleCase,
    );

    const referenceScreenshot = await takeStableScreenshot(reference);
    const svgScreenshot = await takeStableScreenshot(svgFrame);

    await expectScreenshotsToMatch({
      actual: svgScreenshot,
      artifactPrefix: `logo-three-angle-${angleCase.name}`,
      expected: referenceScreenshot,
      maxDiffPixelRatio: MAX_ANGLE_PARITY_DIFF_PIXEL_RATIO,
      testInfo,
    });
  });
}
