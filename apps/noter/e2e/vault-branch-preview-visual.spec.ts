import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "vault-branch-preview-link",
    snapshotName: "vault-branch-preview-link.png",
    shouldShowPreview: true,
  },
  {
    mode: "vault-branch-preview-missing",
    snapshotName: "vault-branch-preview-missing.png",
    shouldShowPreview: false,
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`vault branch preview fixture (${scenario.mode})`, async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 180 });
    await page.goto(`/visual-fixture.html?mode=${scenario.mode}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const fixture = page.getByTestId("vault-branch-preview-visual-fixture");
    const previewLink = fixture.getByRole("link", {
      name: "Cloudflare preview",
    });
    if (scenario.shouldShowPreview) {
      await expect(previewLink).toBeVisible();
    } else {
      await expect(previewLink).toHaveCount(0);
    }

    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.05,
    });
  });
}
