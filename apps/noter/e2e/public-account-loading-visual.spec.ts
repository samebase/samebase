import { expect, test } from "@playwright/test";

const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0,
  maxDiffPixels: 0,
} as const;

test("public account checking login fixture", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 220 });
  await page.goto("/visual-fixture?mode=public-account-checking-login", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("public-account-checking-login-visual-fixture");
  await expect(fixture.getByRole("status", { name: "checking login" })).toBeVisible();
  await expect(fixture.locator(".animate-spin")).toHaveCount(1);
  await expect(fixture).toHaveScreenshot(
    "public-account-checking-login.png",
    strictScreenshotOptions,
  );
});
