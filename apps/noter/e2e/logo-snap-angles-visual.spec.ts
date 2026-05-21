import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import {
  PUBLIC_LANDING_LOGO_DIAGONAL_ELEVATION_SNAP_DEGREES,
  PUBLIC_LANDING_LOGO_DIAGONAL_ROTATION_SNAP_DEGREES,
  PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES,
  PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ROTATION_SNAP_DEGREES,
} from "../src/lib/publicLandingLogo";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

const SNAPSHOT_DIRECTORY_PATH = fileURLToPath(
  new URL("./logo-snap-angles-visual.spec.ts-snapshots/", import.meta.url),
);
const SNAPSHOT_NAME = "logo-snap-angle-matrix.png";
const FIXTURE_BACKGROUND_COLOR = "#9ca3af";
const PREVIEW_SIZE = 180;
const MATRIX_HEADER_SIZE = 96;

test.setTimeout(120_000);

type LogoSnapMatrix = {
  description: string;
  elevationDegrees: readonly number[];
  rotationDegrees: readonly number[];
  title: string;
};

type RenderedLogoSnapMatrix = LogoSnapMatrix & {
  imageDataByKey: Map<string, string>;
};

const LOGO_SNAP_MATRICES = [
  {
    description: "Orthographic rotations use only orthographic elevation snap points.",
    elevationDegrees: PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES,
    rotationDegrees: PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ROTATION_SNAP_DEGREES,
    title: "Orthographic snap matrix",
  },
  {
    description:
      "Diagonal rotations keep the shared cardinal elevations plus the isometric elevation family.",
    elevationDegrees: PUBLIC_LANDING_LOGO_DIAGONAL_ELEVATION_SNAP_DEGREES,
    rotationDegrees: PUBLIC_LANDING_LOGO_DIAGONAL_ROTATION_SNAP_DEGREES,
    title: "Diagonal snap matrix",
  },
] as const satisfies readonly LogoSnapMatrix[];

function formatAngleLabel(angleDegrees: number): string {
  const normalizedAngle = angleDegrees % 360;
  const isWholeNumber = Number.isInteger(normalizedAngle);
  return `${isWholeNumber ? normalizedAngle.toFixed(0) : normalizedAngle.toFixed(3)}°`;
}

function buildCellKey(rotationDegrees: number, elevationDegrees: number): string {
  return `${rotationDegrees}:${elevationDegrees}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function captureLogoSnapCellScreenshot(
  page: Page,
  rotationDegrees: number,
  elevationDegrees: number,
): Promise<string> {
  await page.goto(
    `/visual-fixture?mode=logo-snap-angles&rotation=${encodeURIComponent(
      rotationDegrees,
    )}&elevation=${encodeURIComponent(elevationDegrees)}`,
    { waitUntil: "domcontentloaded" },
  );

  const fixture = page.getByTestId("logo-snap-angles-visual-fixture");
  await expect(fixture).toBeVisible();

  const cell = page.getByTestId("logo-snap-angle-cell");
  await expect(cell).toBeVisible();
  await expect(cell).toHaveAttribute("data-render-ready", "true");
  const screenshot = await takeStableScreenshot(cell);
  return screenshot.toString("base64");
}

function renderMatrixSection(matrix: RenderedLogoSnapMatrix): string {
  const gridTemplateColumns = `${MATRIX_HEADER_SIZE}px repeat(${matrix.rotationDegrees.length}, ${PREVIEW_SIZE}px)`;

  const rotationHeaders = matrix.rotationDegrees
    .map(
      (rotationDegrees) =>
        `<div class="matrix-column-header">Rot ${escapeHtml(formatAngleLabel(rotationDegrees))}</div>`,
    )
    .join("");

  const rows = matrix.elevationDegrees
    .map((elevationDegrees) => {
      const rowHeader = `<div class="matrix-row-header">Elev ${escapeHtml(formatAngleLabel(elevationDegrees))}</div>`;
      const cells = matrix.rotationDegrees
        .map((rotationDegrees) => {
          const imageData =
            matrix.imageDataByKey.get(buildCellKey(rotationDegrees, elevationDegrees)) ?? "";
          return `<div class="matrix-cell"><img alt="Rot ${escapeHtml(formatAngleLabel(rotationDegrees))} Elev ${escapeHtml(formatAngleLabel(elevationDegrees))}" src="data:image/png;base64,${imageData}" width="${PREVIEW_SIZE}" height="${PREVIEW_SIZE}"/></div>`;
        })
        .join("");
      return `${rowHeader}${cells}`;
    })
    .join("");

  return `<section class="matrix-section">
    <div class="matrix-copy">
      <h2>${escapeHtml(matrix.title)}</h2>
      <p>${escapeHtml(matrix.description)}</p>
    </div>
    <div class="matrix-grid" style="grid-template-columns:${gridTemplateColumns}">
      <div class="matrix-corner"></div>
      ${rotationHeaders}
      ${rows}
    </div>
  </section>`;
}

function buildMatrixHtml(matrices: readonly RenderedLogoSnapMatrix[]): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Logo Snap Angle Matrix</title>
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: ${FIXTURE_BACKGROUND_COLOR};
        color: #1e293b;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .page {
        display: grid;
        gap: 32px;
        margin: 0 auto;
        max-width: 1152px;
        min-height: 100vh;
        padding: 24px;
      }
      .page-copy {
        display: grid;
        gap: 8px;
      }
      .page-copy h1 {
        font-size: 20px;
        font-weight: 600;
        line-height: 1.2;
        margin: 0;
      }
      .page-copy p {
        color: #475569;
        font-size: 14px;
        line-height: 1.4;
        margin: 0;
      }
      .sections {
        display: grid;
        gap: 32px;
      }
      .matrix-section {
        display: grid;
        gap: 12px;
      }
      .matrix-copy {
        display: grid;
        gap: 4px;
      }
      .matrix-copy h2 {
        font-size: 18px;
        font-weight: 600;
        line-height: 1.2;
        margin: 0;
      }
      .matrix-copy p {
        color: #475569;
        font-size: 14px;
        line-height: 1.4;
        margin: 0;
      }
      .matrix-grid {
        background: #cbd5e1;
        border: 1px solid #cbd5e1;
        display: grid;
        gap: 1px;
      }
      .matrix-corner {
        background: #e2e8f0;
        border: 1px solid #cbd5e1;
      }
      .matrix-column-header,
      .matrix-row-header {
        align-items: center;
        background: #f1f5f9;
        border: 1px solid #cbd5e1;
        color: #1e293b;
        display: flex;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.2;
      }
      .matrix-column-header {
        justify-content: center;
        padding: 12px 8px;
      }
      .matrix-row-header {
        justify-content: flex-end;
        padding: 8px 12px;
      }
      .matrix-cell {
        background: transparent;
        border: 1px solid #cbd5e1;
        height: ${PREVIEW_SIZE}px;
        width: ${PREVIEW_SIZE}px;
      }
      .matrix-cell img {
        display: block;
        height: ${PREVIEW_SIZE}px;
        width: ${PREVIEW_SIZE}px;
      }
    </style>
  </head>
  <body>
    <div class="page" data-testid="logo-snap-angle-matrix">
      <div class="page-copy">
        <h1>Logo Snap Angle Matrix</h1>
        <p>Single-image contact sheet for every configured logo snap view.</p>
      </div>
      <div class="sections">
        ${matrices.map((matrix) => renderMatrixSection(matrix)).join("")}
      </div>
    </div>
  </body>
</html>`;
}

test("logo snap angle matrix visual fixture", async ({ page }, testInfo) => {
  mkdirSync(SNAPSHOT_DIRECTORY_PATH, { recursive: true });

  const renderedMatrices: RenderedLogoSnapMatrix[] = [];
  for (const matrix of LOGO_SNAP_MATRICES) {
    const imageDataByKey = new Map<string, string>();

    for (const elevationDegrees of matrix.elevationDegrees) {
      for (const rotationDegrees of matrix.rotationDegrees) {
        const imageData = await captureLogoSnapCellScreenshot(
          page,
          rotationDegrees,
          elevationDegrees,
        );
        imageDataByKey.set(buildCellKey(rotationDegrees, elevationDegrees), imageData);
      }
    }

    renderedMatrices.push({
      ...matrix,
      imageDataByKey,
    });
  }

  await page.setViewportSize({ width: 1400, height: 2200 });
  await page.setContent(buildMatrixHtml(renderedMatrices), {
    waitUntil: "load",
  });
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete));

  const fixture = page.getByTestId("logo-snap-angle-matrix");
  await expect(fixture).toBeVisible();

  const actualScreenshot = await takeStableScreenshot(fixture);
  const snapshotPath = `${SNAPSHOT_DIRECTORY_PATH}${SNAPSHOT_NAME}`;

  if (
    !existsSync(snapshotPath) ||
    testInfo.config.updateSnapshots === "all" ||
    testInfo.config.updateSnapshots === "changed"
  ) {
    writeFileSync(snapshotPath, actualScreenshot);
  }

  await expectScreenshotsToMatch({
    actual: actualScreenshot,
    artifactPrefix: SNAPSHOT_NAME.replace(/\.png$/, ""),
    expected: readFileSync(snapshotPath),
    maxDiffPixelRatio: 0.01,
    testInfo,
  });
});
