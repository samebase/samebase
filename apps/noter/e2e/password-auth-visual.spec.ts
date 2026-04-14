import { expect, test } from "@playwright/test";

const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0,
  maxDiffPixels: 0,
} as const;

test("password auth visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1400 });
  await page.goto("/visual-fixture.html?mode=password-auth", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByTestId("password-auth-visual-preview"),
  ).toHaveScreenshot("password-auth-preview.png", strictScreenshotOptions);

  await expect(
    page.getByTestId("password-auth-visual-local-worktree"),
  ).toHaveScreenshot(
    "password-auth-local-worktree.png",
    strictScreenshotOptions,
  );
});
