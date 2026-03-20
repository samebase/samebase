import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { STATIC_LOGO_ELEVATION_DEGREES } from "../src/components/logoStaticSvgContract";
import { PUBLIC_LANDING_LOGO_ROTATION_SNAP_DEGREES } from "../src/lib/publicLandingLogo";

type SnapAngleCase = {
  elevationDegrees: number;
  rotationDegrees: number;
};

const ORTHOGRAPHIC_ELEVATION_PREVIEW_DEGREES = [0, 45, 90] as const;
const DIAGONAL_ROTATION_PREVIEW_DEGREES =
  PUBLIC_LANDING_LOGO_ROTATION_SNAP_DEGREES.filter(
    (rotationDegrees) => rotationDegrees % 90 !== 0,
  );

const SNAP_ANGLE_CASES = [
  ...DIAGONAL_ROTATION_PREVIEW_DEGREES.map((rotationDegrees) => ({
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    rotationDegrees,
  })),
  ...ORTHOGRAPHIC_ELEVATION_PREVIEW_DEGREES.map((elevationDegrees) => ({
    elevationDegrees,
    rotationDegrees: 0,
  })),
] as const satisfies readonly SnapAngleCase[];

function formatAngleSlug(angleDegrees: number): string {
  const normalizedAngle = angleDegrees % 360;
  const angleText = Number.isInteger(normalizedAngle)
    ? normalizedAngle.toFixed(0)
    : normalizedAngle.toFixed(3).replace(".", "_");
  return angleText.replace("-", "neg-");
}

const SNAPSHOT_DIRECTORY_PATH = fileURLToPath(
  new URL("./logo-snap-angles-visual.spec.ts-snapshots/", import.meta.url),
);

for (const snapCase of SNAP_ANGLE_CASES) {
  const rotationSlug = formatAngleSlug(snapCase.rotationDegrees);
  const elevationSlug = formatAngleSlug(snapCase.elevationDegrees);
  const snapshotName = `logo-snap-rotation-${rotationSlug}-elevation-${elevationSlug}.png`;

  test(`logo snap visual fixture (rotation ${rotationSlug}, elevation ${elevationSlug})`, async ({
    page,
  }) => {
    mkdirSync(SNAPSHOT_DIRECTORY_PATH, { recursive: true });

    await page.setViewportSize({ width: 1600, height: 1400 });
    await page.goto("/visual-fixture.html?mode=logo-snap-angles", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId(
      `logo-snap-rotation-${rotationSlug}-elevation-${elevationSlug}`,
    );
    await expect(fixture).toBeVisible();

    await page.waitForTimeout(150);
    await fixture.screenshot({
      animations: "disabled",
      caret: "hide",
      path: `${SNAPSHOT_DIRECTORY_PATH}${snapshotName}`,
      scale: "css",
    });
  });
}
