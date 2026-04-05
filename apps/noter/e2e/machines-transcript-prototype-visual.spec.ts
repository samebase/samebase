import { test, type Page } from "@playwright/test";
import { expectScreenshotsToMatch } from "./visualDiff";

const FIXTURE_PATH = "/visual-fixture.html?mode=machines-transcript-prototype";

async function openTranscriptPrototype(
  page: Page,
  options: { dev?: boolean } = {},
) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(options.dev ? `${FIXTURE_PATH}&dev` : FIXTURE_PATH, {
    waitUntil: "networkidle",
  });

  const root = page.getByTestId("machines-transcript-prototype");
  await root.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-transcript-block]").length > 2,
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return root;
}

async function takeStableViewportScreenshot(page: Page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return await page.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
}

async function forceSelectionState(page: Page, active: boolean) {
  await page.evaluate((nextActive) => {
    const root = document.querySelector('[data-testid="machines-transcript-prototype"]');
    if (!(root instanceof HTMLElement)) {
      throw new Error("Expected transcript prototype root");
    }

    root.setAttribute("data-selection-active", nextActive ? "true" : "false");
  }, active);
}

async function hideDecorations(page: Page) {
  await page.addStyleTag({
    content: `
      .machines-transcript-prototype-rendered-layer {
        display: none !important;
      }
      .machines-transcript-prototype-source-body-user,
      .machines-transcript-prototype-source-body-assistant,
      .machines-transcript-prototype-source-body-work {
        border-color: transparent !important;
        background: transparent !important;
      }
      .machines-transcript-prototype-source-tag {
        color: transparent !important;
      }
    `,
  });
}

async function hideText(page: Page) {
  await page.addStyleTag({
    content: `
      .machines-transcript-prototype-source-paragraph,
      .machines-transcript-prototype-source-tag {
        color: transparent !important;
      }
    `,
  });
}

test("machines transcript prototype stays visually stable when selection state flips", async ({
  page,
}, testInfo) => {
  await openTranscriptPrototype(page);
  const restingScreenshot = await takeStableViewportScreenshot(page);

  await forceSelectionState(page, true);
  const selectedScreenshot = await takeStableViewportScreenshot(page);

  await expectScreenshotsToMatch({
    actual: selectedScreenshot,
    expected: restingScreenshot,
    artifactPrefix: "machines-transcript-prototype-full-selection-stability",
    maxDiffPixelRatio: 0.0001,
    testInfo,
  });
});

test("machines transcript prototype text stays visually stable when selection state flips", async ({
  page,
}, testInfo) => {
  await openTranscriptPrototype(page);
  await hideDecorations(page);

  const restingScreenshot = await takeStableViewportScreenshot(page);

  await forceSelectionState(page, true);
  const selectedScreenshot = await takeStableViewportScreenshot(page);

  await expectScreenshotsToMatch({
    actual: selectedScreenshot,
    expected: restingScreenshot,
    artifactPrefix: "machines-transcript-prototype-text-selection-stability",
    maxDiffPixelRatio: 0.0001,
    testInfo,
  });
});

test("machines transcript prototype decorations stay visually stable when selection state flips", async ({
  page,
}, testInfo) => {
  await openTranscriptPrototype(page);
  await hideText(page);

  const restingScreenshot = await takeStableViewportScreenshot(page);

  await forceSelectionState(page, true);
  const selectedScreenshot = await takeStableViewportScreenshot(page);

  await expectScreenshotsToMatch({
    actual: selectedScreenshot,
    expected: restingScreenshot,
    artifactPrefix: "machines-transcript-prototype-decoration-selection-stability",
    maxDiffPixelRatio: 0.0001,
    testInfo,
  });
});

test("machines transcript prototype dev source tags do not move the text", async ({
  page,
}, testInfo) => {
  await openTranscriptPrototype(page, { dev: true });
  await hideDecorations(page);
  await page.addStyleTag({
    content: `
      .machines-transcript-prototype-source-tag {
        color: transparent !important;
      }
    `,
  });

  const restingScreenshot = await takeStableViewportScreenshot(page);

  await forceSelectionState(page, true);
  const selectedScreenshot = await takeStableViewportScreenshot(page);

  await expectScreenshotsToMatch({
    actual: selectedScreenshot,
    expected: restingScreenshot,
    artifactPrefix: "machines-transcript-prototype-dev-text-stability",
    maxDiffPixelRatio: 0.0001,
    testInfo,
  });
});
