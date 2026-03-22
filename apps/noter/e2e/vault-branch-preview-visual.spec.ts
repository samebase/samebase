import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "vault-branch-preview-link",
    snapshotName: "vault-branch-preview-link.png",
  },
  {
    mode: "vault-branch-preview-missing",
    snapshotName: "vault-branch-preview-missing.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`vault branch preview fixture (${scenario.mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/visual-fixture.html?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId("vault-branch-preview-visual-fixture");
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.01,
    });
  });
}
