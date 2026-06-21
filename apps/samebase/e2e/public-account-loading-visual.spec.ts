import { expect, test } from "./visualFixtureTest";

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
  const loadingAccountSection = fixture.getByTestId("public-landing-account-section");
  await expect(loadingAccountSection.getByText("checking login", { exact: true })).toBeVisible();
  await expect(fixture.locator(".animate-spin")).toHaveCount(0);
  await expect(fixture).toHaveScreenshot(
    "public-account-checking-login.png",
    strictScreenshotOptions,
  );
});
