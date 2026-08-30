import { devices, expect, test } from "@playwright/test";

const screenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

test("Terms acceptance", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto("/visual-fixture?mode=terms-acceptance", { waitUntil: "networkidle" });

  const acceptance = page.getByTestId("terms-acceptance");
  await expect(acceptance.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(acceptance).toHaveScreenshot("terms-acceptance-desktop.png", screenshotOptions);
});

test("Terms acceptance on mobile", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for the mobile Terms acceptance visual.");
  }
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto("/visual-fixture?mode=terms-acceptance", { waitUntil: "networkidle" });
    const acceptance = page.getByTestId("terms-acceptance");
    await expect(acceptance.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(acceptance).toHaveScreenshot("terms-acceptance-mobile.png", screenshotOptions);
  } finally {
    await context.close();
  }
});
