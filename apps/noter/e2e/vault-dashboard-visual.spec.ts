import { expect, test } from "@playwright/test";

test("vault dashboard fixture (shared sidebar)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=dashboard-shared-sidebar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-dashboard-shared-sidebar.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (shared sidebar narrow)", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 760 });
  await page.goto("/visual-fixture.html?mode=dashboard-shared-sidebar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot(
    "vault-dashboard-shared-sidebar-narrow.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("vault dashboard fixture (mobile chat dock)", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-chat",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot(
    "vault-dashboard-shared-sidebar-mobile-chat.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("vault dashboard fixture (branch PR labels)", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 180 });
  await page.goto("/visual-fixture.html?mode=vault-branch-pr-labels", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-branch-pr-labels.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("vault dashboard fixture (mobile branch alignment)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=vault-branch-mobile-alignment", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  await expect(fixture).toHaveScreenshot("vault-branch-mobile-alignment.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
