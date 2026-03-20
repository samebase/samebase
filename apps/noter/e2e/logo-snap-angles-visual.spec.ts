import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

const SNAPSHOT_DIRECTORY_PATH = fileURLToPath(
  new URL("./logo-snap-angles-visual.spec.ts-snapshots/", import.meta.url),
);
const SNAPSHOT_NAME = "logo-snap-angle-matrix.png";

test("logo snap angle matrix visual fixture", async ({ page }, testInfo) => {
  mkdirSync(SNAPSHOT_DIRECTORY_PATH, { recursive: true });

  await page.setViewportSize({ width: 1400, height: 1600 });
  await page.goto("/visual-fixture.html?mode=logo-snap-angles", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("logo-snap-angles-visual-fixture");
  await expect(fixture).toBeVisible();

  await page.waitForTimeout(150);
  const actualScreenshot = await takeStableScreenshot(fixture);
  const snapshotPath = `${SNAPSHOT_DIRECTORY_PATH}${SNAPSHOT_NAME}`;

  if (!existsSync(snapshotPath) || testInfo.config.updateSnapshots !== "none") {
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
