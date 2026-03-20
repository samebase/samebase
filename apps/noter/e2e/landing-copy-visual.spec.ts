import { expect, test, type Locator } from "@playwright/test";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";
import { PUBLIC_LANDING_COPY_TEST_ID } from "../src/lib/publicLanding";

const PIXEL_PARITY_LANDING_COPY_FIXTURE_CASES = [
  {
    name: "single-line heading",
    mode: "landing-copy-editable-parity-single-line",
    artifactPrefix: "landing-copy-editable-single-line",
  },
  {
    name: "two-line heading",
    mode: "landing-copy-editable-parity-two-line",
    artifactPrefix: "landing-copy-editable-two-line",
  },
] as const;

async function readLandingCopyLayout(locator: Locator) {
  return locator.evaluate((root) => {
    if (!(root instanceof HTMLElement)) {
      throw new Error("Expected landing copy root");
    }

    const heading = root.querySelector(".cm-line.cm-landing-copy-heading");
    const gap = root.querySelector(".cm-line.cm-landing-copy-gap");
    const firstList = root.querySelector(".cm-line.cm-landing-copy-list-first");

    const readRect = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error("Missing landing copy layout element");
      }

      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        height: rect.height,
      };
    };

    const rootRect = root.getBoundingClientRect();

    return {
      root: {
        top: rootRect.top,
        height: rootRect.height,
      },
      heading: readRect(heading),
      gap: readRect(gap),
      firstList: readRect(firstList),
    };
  });
}

test("landing copy stays visually aligned across the shell handoff", async ({
  page,
}, testInfo) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const landingCopy = page
    .getByTestId(PUBLIC_LANDING_COPY_TEST_ID)
    .locator(".cm-landing-copy");
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
    maxDiffPixelRatio: 0.01,
    testInfo,
  });
});

for (const fixtureCase of PIXEL_PARITY_LANDING_COPY_FIXTURE_CASES) {
  test(`landing copy fixture stays visually aligned for a ${fixtureCase.name}`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/visual-fixture.html?mode=${fixtureCase.mode}`, {
      waitUntil: "networkidle",
    });

    const shellLandingCopy = page
      .getByTestId("landing-copy-tailwind")
      .locator(".cm-landing-copy");
    const devLandingCopy = page
      .getByTestId("landing-copy-prosemark")
      .locator(".cm-landing-copy");

    const shellScreenshot = await takeStableScreenshot(shellLandingCopy);
    const devScreenshot = await takeStableScreenshot(devLandingCopy);

    await expectScreenshotsToMatch({
      actual: devScreenshot,
      expected: shellScreenshot,
      artifactPrefix: fixtureCase.artifactPrefix,
      maxDiffPixelRatio: 0.01,
      testInfo,
    });
  });
}

test("landing copy fixture keeps a three-line heading aligned with the first bullet", async ({
  page,
}) => {
  await page.goto(
    "/visual-fixture.html?mode=landing-copy-editable-parity-three-line",
    {
      waitUntil: "networkidle",
    },
  );

  const shellLandingCopy = page
    .getByTestId("landing-copy-tailwind")
    .locator(".cm-landing-copy");
  const devLandingCopy = page
    .getByTestId("landing-copy-prosemark")
    .locator(".cm-landing-copy");

  const shellLayout = await readLandingCopyLayout(shellLandingCopy);
  const devLayout = await readLandingCopyLayout(devLandingCopy);

  expect(
    Math.abs(devLayout.root.height - shellLayout.root.height),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(devLayout.heading.height - shellLayout.heading.height),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(devLayout.gap.height - shellLayout.gap.height),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(devLayout.firstList.top - shellLayout.firstList.top),
  ).toBeLessThanOrEqual(1);
});

test("landing copy stays visually aligned when opening the dev editor", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Math.random = () => 0;
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const shellLandingCopy = page
    .getByTestId(PUBLIC_LANDING_COPY_TEST_ID)
    .locator(".cm-landing-copy");
  await page.getByTestId("public-landing-shell").waitFor({ state: "visible" });
  const shellScreenshot = await takeStableScreenshot(shellLandingCopy);

  await page.goto("/?dev", { waitUntil: "networkidle" });

  const devLandingCopy = page
    .getByTestId(PUBLIC_LANDING_COPY_TEST_ID)
    .locator(".cm-landing-copy");
  await devLandingCopy.waitFor({ state: "visible" });
  const devScreenshot = await takeStableScreenshot(devLandingCopy);

  await expectScreenshotsToMatch({
    actual: devScreenshot,
    expected: shellScreenshot,
    artifactPrefix: "landing-copy-dev-editor",
    maxDiffPixelRatio: 0.01,
    testInfo,
  });
});
