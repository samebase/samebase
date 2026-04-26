import { expect, test, type Locator } from "@playwright/test";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";
import { LANDING_DEV_MODE_LINK_LABEL } from "../src/lib/landingDevMode";
import { PUBLIC_LANDING_COPY_TEST_ID } from "../src/lib/publicLanding";

async function readStaticHeadingFontSize(landingCopy: Locator) {
  return await landingCopy
    .locator("h2")
    .first()
    .evaluate((node) => getComputedStyle(node).fontSize);
}

async function readProsemarkHeadingFontSize(landingCopy: Locator) {
  return await landingCopy
    .locator(".cm-line")
    .first()
    .evaluate((line) => {
      for (const span of line.querySelectorAll("span")) {
        const rect = span.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && span.textContent?.trim()) {
          return getComputedStyle(span).fontSize;
        }
      }

      return getComputedStyle(line).fontSize;
    });
}

test("landing copy keeps ProseMark behind editable dev mode", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });

  await page.goto("/", { waitUntil: "networkidle" });

  const shellLandingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);
  await expect(shellLandingCopy.locator(".cm-editor")).toHaveCount(0);
  await expect(
    shellLandingCopy.locator('[contenteditable="true"]'),
  ).toHaveCount(0);
  const shellHeadingFontSize =
    await readStaticHeadingFontSize(shellLandingCopy);
  const shellScreenshot = await takeStableScreenshot(shellLandingCopy);

  await page
    .getByRole("link", { name: LANDING_DEV_MODE_LINK_LABEL, exact: true })
    .click();

  const devLandingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);
  await devLandingCopy.waitFor({ state: "visible" });
  await expect(devLandingCopy.locator(".cm-editor")).toHaveCount(1);
  await expect(
    devLandingCopy.locator('[aria-hidden="true"] .cm-editor'),
  ).toHaveCount(0);
  await expect(devLandingCopy.locator('[contenteditable="true"]')).toHaveCount(
    1,
  );
  await expect
    .poll(() => readProsemarkHeadingFontSize(devLandingCopy))
    .toBe(shellHeadingFontSize);
  const devScreenshot = await takeStableScreenshot(devLandingCopy);

  await expectScreenshotsToMatch({
    actual: devScreenshot,
    expected: shellScreenshot,
    artifactPrefix: "landing-copy-dev-editable",
    maxDiffPixelRatio: 0.03,
    testInfo,
  });
});
