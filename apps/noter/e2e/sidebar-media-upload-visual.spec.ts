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
    screenshotTarget: "dialog-form",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`sidebar media upload fixture (${scenario.name})`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.goto("/visual-fixture?mode=sidebar-media-upload", {
      waitUntil: "domcontentloaded",
    });

    const fixture = page.getByTestId("sidebar-media-upload-visual-fixture");
    const footerTrigger = page.getByText("Drop file or click");

    await expect(fixture).toBeVisible();
    if (scenario.expectsFooterVisible) {
      await expect(footerTrigger).toBeVisible();
    }
    await expect(page.getByText("Upload Image")).toBeVisible();
    await expect(page.getByText("This replaces the existing file")).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });

    const screenshotTarget =
      scenario.screenshotTarget === "dialog-form"
        ? page.getByTestId("media-upload-dialog-form")
        : fixture;
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
