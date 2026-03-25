import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    name: "desktop",
    snapshotName: "sidebar-media-upload-desktop.png",
    viewport: { width: 1440, height: 1000 },
    expectsFooterVisible: true,
    screenshotTarget: "page",
  },
  {
    name: "mobile",
    snapshotName: "sidebar-media-upload-mobile.png",
    viewport: { width: 390, height: 844 },
    expectsFooterVisible: false,
    screenshotTarget: "dialog",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`sidebar media upload fixture (${scenario.name})`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.goto("/visual-fixture.html?mode=sidebar-media-upload", {
      waitUntil: "domcontentloaded",
    });

    const fixture = page.getByTestId("sidebar-media-upload-visual-fixture");

    await expect(fixture).toBeVisible();
    if (scenario.expectsFooterVisible) {
      await expect(page.getByText("Drop file or click")).toBeVisible();
    }
    await expect(
      page.getByText("This replaces the existing file"),
    ).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const screenshotTarget =
      scenario.screenshotTarget === "dialog"
        ? page.getByTestId("media-upload-dialog-form")
        : page;
    const screenshot = await screenshotTarget.screenshot({
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
    expect(screenshot).toMatchSnapshot(scenario.snapshotName, {
      maxDiffPixelRatio: 0.01,
    });
  });
}
