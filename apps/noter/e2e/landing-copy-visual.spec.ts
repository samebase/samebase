import { expect, test, type Locator } from "@playwright/test";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";
import { LANDING_DEV_MODE_LINK_LABEL } from "../src/lib/landingDevMode";
import { PUBLIC_LANDING_COPY_TEST_ID } from "../src/lib/publicLanding";

async function readStaticHeadingStyle(landingCopy: Locator) {
  return await landingCopy
    .locator("h2")
    .first()
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      };
    });
}

async function readProsemarkHeadingStyle(landingCopy: Locator) {
  return await landingCopy
    .locator(".cm-line")
    .first()
    .evaluate((line) => {
      for (const span of line.querySelectorAll("span")) {
        const rect = span.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && span.textContent?.trim()) {
          const style = getComputedStyle(span);
          return {
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
          };
        }
      }

      const style = getComputedStyle(line);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      };
    });
}

test("landing copy keeps ProseMark behind editable dev mode", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });

  await page.goto("/", { waitUntil: "networkidle" });

  const shellLandingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);
  await expect(shellLandingCopy.locator(".cm-editor")).toHaveCount(0);
  await expect(shellLandingCopy.locator('[contenteditable="true"]')).toHaveCount(0);
  const shellHeadingStyle = await readStaticHeadingStyle(shellLandingCopy);
  const shellScreenshot = await takeStableScreenshot(shellLandingCopy);

  await page.getByRole("link", { name: LANDING_DEV_MODE_LINK_LABEL, exact: true }).click();

  const devLandingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);
  await devLandingCopy.waitFor({ state: "visible" });
  await expect(devLandingCopy.locator(".cm-editor")).toHaveCount(1);
  await expect(devLandingCopy.locator('[aria-hidden="true"] .cm-editor')).toHaveCount(0);
  await expect(devLandingCopy.locator('[contenteditable="true"]')).toHaveCount(1);
  await expect.poll(() => readProsemarkHeadingStyle(devLandingCopy)).toEqual(shellHeadingStyle);
  const devScreenshot = await takeStableScreenshot(devLandingCopy);

  await expectScreenshotsToMatch({
    actual: devScreenshot,
    expected: shellScreenshot,
    artifactPrefix: "landing-copy-dev-editable",
    // The style assertion above owns heading parity; this broader guard leaves
    // room for DOM and CodeMirror glyph rasterization noise.
    maxDimensionDeltaPx: {
      height: 2,
    },
    maxDiffPixelRatio: 0.075,
    testInfo,
  });
});
