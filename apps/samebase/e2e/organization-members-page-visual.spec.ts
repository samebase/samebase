import { expect, test } from "./visualFixtureTest";

test("organization members owner page", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1200 });
  await page.goto("/visual-fixture?mode=organization-members-page-owner", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("organization-members-page")).toHaveScreenshot(
    "organization-members-page-owner.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.001,
      scale: "css",
    },
  );
});

test.describe("organization members owner page mobile", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { height: 664, width: 390 } });

  test("keeps member actions and status readable", async ({ page }) => {
    await page.goto("/visual-fixture?mode=organization-members-page-owner", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("organization-members-page")).toHaveScreenshot(
      "organization-members-page-owner-mobile.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.001,
        scale: "css",
      },
    );
  });
});
