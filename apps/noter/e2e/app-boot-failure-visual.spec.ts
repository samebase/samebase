import { expect, test, type Page } from "@playwright/test";

const appBootFailureDesktopScenarios = [
  {
    mode: "app-boot-failure-stale",
    snapshotName: "app-boot-failure-stale.png",
  },
  {
    mode: "app-boot-failure-generic",
    snapshotName: "app-boot-failure-generic.png",
  },
] as const;

const appBootFailureMobileScenarios = [
  {
    mode: "app-boot-failure-stale",
    snapshotName: "app-boot-failure-stale-mobile.png",
  },
  {
    mode: "app-boot-failure-generic",
    snapshotName: "app-boot-failure-generic-mobile.png",
  },
] as const;

const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.02,
} as const;

async function waitForStableFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });
}

async function captureAppBootFailureVisual(
  page: Page,
  scenario: { mode: string; snapshotName: string },
) {
  await page.goto(`/visual-fixture.html?mode=${scenario.mode}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await waitForStableFonts(page);

  await expect(page).toHaveScreenshot(scenario.snapshotName, {
    ...strictScreenshotOptions,
    mask: [page.getByText(/^Build:/)],
  });
}

test("app boot failure visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });

  for (const scenario of appBootFailureDesktopScenarios) {
    await captureAppBootFailureVisual(page, scenario);
  }
});

test("app boot failure visual fixture (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const scenario of appBootFailureMobileScenarios) {
    await captureAppBootFailureVisual(page, scenario);
  }
});
