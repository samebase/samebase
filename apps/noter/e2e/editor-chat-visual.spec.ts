import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "editor-chat-closed",
    snapshotName: "editor-chat-closed.png",
    viewport: { width: 600, height: 520 },
    maxDiffPixels: 50,
  },
  {
    mode: "editor-chat-open-desktop",
    snapshotName: "editor-chat-open-desktop.png",
    viewport: { width: 1200, height: 900 },
    // Real in-UI copy renders with materially different antialiasing on
    // macOS vs Ubuntu Chromium, so this threshold needs to absorb text-only
    // raster drift while still catching layout regressions.
    maxDiffPixels: 20000,
  },
  {
    mode: "editor-chat-open-mobile",
    snapshotName: "editor-chat-open-mobile.png",
    viewport: { width: 430, height: 932 },
    maxDiffPixels: 12000,
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`editor chat fixture (${scenario.mode})`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.goto(`/visual-fixture.html?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId("editor-chat-visual-fixture");
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixels: scenario.maxDiffPixels,
    });
  });
}
