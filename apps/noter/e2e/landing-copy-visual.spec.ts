import { test } from "@playwright/test";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";
import { PUBLIC_LANDING_COPY_TEST_ID } from "../src/lib/publicLanding";

test("landing copy stays visually aligned across the shell handoff", async ({
  page,
}, testInfo) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const landingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);
  await page.getByTestId("public-landing-shell").waitFor({ state: "visible" });

  const shellScreenshot = await takeStableScreenshot(landingCopy);
  await page.getByTestId("public-landing-shell").waitFor({
    state: "detached",
    timeout: 10_000,
  });
  const hydratedScreenshot = await takeStableScreenshot(landingCopy);

  await expectScreenshotsToMatch({
    actual: hydratedScreenshot,
    expected: shellScreenshot,
    artifactPrefix: "landing-copy-handoff",
    maxDiffPixelRatio: 0.001,
    testInfo,
  });
});
