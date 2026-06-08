import { expect, test, type Locator } from "@playwright/test";

const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0,
  maxDiffPixels: 0,
} as const;

async function visibleHeight(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Expected account section to be visible before measuring height.");
  }
  return box.height;
}

test("public account checking login fixture", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 220 });
  await page.goto("/visual-fixture?mode=public-account-checking-login", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("public-account-checking-login-visual-fixture");
  const loadingAccountSection = fixture.getByTestId("public-landing-account-section");
  await expect(loadingAccountSection.getByRole("status", { name: "checking login" })).toBeVisible();
  await expect(fixture.locator(".animate-spin")).toHaveCount(1);
  await expect(fixture).toHaveScreenshot(
    "public-account-checking-login.png",
    strictScreenshotOptions,
  );

  const loadingHeight = await visibleHeight(loadingAccountSection);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const resolvedAccountSection = page.getByTestId("public-landing-account-section");
  await expect(resolvedAccountSection.getByRole("button", { name: "not logged in" })).toBeVisible();
  const resolvedHeight = await visibleHeight(resolvedAccountSection);
  expect(resolvedHeight).toBe(loadingHeight);
});
