import { expect, test } from "@playwright/test";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";
import { LANDING_DEV_MODE_LINK_LABEL } from "../src/lib/landingDevMode";
import { PUBLIC_LANDING_COPY_TEST_ID } from "../src/lib/publicLanding";

test("landing copy uses the same ProseMark surface in editable dev mode", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });

  await page.goto("/", { waitUntil: "networkidle" });

  const shellLandingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);
  await expect(shellLandingCopy.locator(".cm-editor")).toHaveCount(1);
  await expect(
    shellLandingCopy.locator('[aria-hidden="true"] .cm-editor'),
  ).toHaveCount(0);
  await expect(
    shellLandingCopy.locator('[contenteditable="true"]'),
  ).toHaveCount(0);
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
  const devScreenshot = await takeStableScreenshot(devLandingCopy);

  await expectScreenshotsToMatch({
    actual: devScreenshot,
    expected: shellScreenshot,
    artifactPrefix: "landing-copy-dev-editable",
    maxDiffPixelRatio: 0,
    maxDiffPixels: 0,
    testInfo,
  });
});
