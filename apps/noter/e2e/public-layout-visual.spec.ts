import { expect, test } from "@playwright/test";

const publicLayoutSnapshotSuffix = process.platform;

test("public landing route uses the right sidebar shell", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.57;
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveScreenshot(
    `public-layout-landing-${publicLayoutSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("public landing dev rail exposes the route URL editor", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0.57;
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?dev", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const routeUrlEditor = page.getByTestId("route-url-editor");
  await expect(routeUrlEditor).toHaveValue("/?dev");
  await expect(page).toHaveScreenshot(
    `public-layout-landing-dev-${publicLayoutSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );

  await routeUrlEditor.fill("/terms?dev");
  await routeUrlEditor.press("Enter");
  await expect(page).toHaveURL(/\/terms\?dev$/);
  await expect(page.getByTestId("route-url-editor")).toHaveValue("/terms?dev");
});
