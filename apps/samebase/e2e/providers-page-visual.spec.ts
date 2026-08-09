import { expect, test } from "./visualFixtureTest";

test("providers page connected fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=providers-page-connected", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-connected.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.001,
    },
  );
});

test.describe("providers page mobile", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { height: 664, width: 390 } });

  test("keeps the scroll rail outside access status icons", async ({ page }) => {
    await page.goto("/visual-fixture?mode=providers-page-connected", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    const providerPage = page.getByTestId("provider-connections-page");
    const geometry = await providerPage.evaluate((element) => {
      let scrollport = element.parentElement;
      while (scrollport && getComputedStyle(scrollport).overflowY !== "auto") {
        scrollport = scrollport.parentElement;
      }

      const statusIcon = element.querySelector('[data-provider-access-check-state="ok"] svg');
      if (!scrollport || !statusIcon) {
        throw new Error("Provider page scroll geometry is not available.");
      }

      return {
        pageRight: Math.round(element.getBoundingClientRect().right),
        scrollportRight: Math.round(scrollport.getBoundingClientRect().right),
        statusIconRight: Math.round(statusIcon.getBoundingClientRect().right),
      };
    });

    expect(geometry.scrollportRight).toBe(geometry.pageRight);
    expect(geometry.scrollportRight - geometry.statusIconRight).toBeGreaterThanOrEqual(24);
    await expect(providerPage).toHaveScreenshot("providers-page-connected-mobile.png", {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.001,
      scale: "css",
    });
  });
});

test("providers page personal owner fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=providers-page-personal", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-personal.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.001,
    },
  );
});

test("providers page personal owner requires a GitHub sign-in method", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=providers-page-personal-sign-in-required", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-personal-sign-in-required.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.001,
    },
  );
});

test("providers page personal owner rejects a different GitHub sign-in method", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=providers-page-personal-sign-in-mismatch", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-personal-sign-in-mismatch.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.001,
    },
  );
});

test("providers page authorization error fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=providers-page-authorization-error", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-authorization-error.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.001,
    },
  );
});

test("providers page loading fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=providers-page-loading", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-loading.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.001,
    },
  );
});

test("providers page not configured fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=providers-page-not-configured", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-not-configured.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.001,
    },
  );
});

test("providers page recovery fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=providers-page-recovery", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("provider-connections-page")).toHaveScreenshot(
    "providers-page-recovery.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.001,
    },
  );
});
