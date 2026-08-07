import { expect, test } from "./visualFixtureTest";

test("connect repository loading more status", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1100 });
  await page.goto("/visual-fixture?mode=connect-repository-loading-more", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const loadingMore = page.getByTestId("connect-repository-loading-more");
  await expect(loadingMore).toHaveText("Loading more repositories...");
  await expect(loadingMore).toHaveScreenshot("connect-repository-loading-more.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
});

test("connect repository provider blocker", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 520 });
  await page.clock.install({ time: Date.parse("2026-08-06T12:00:00Z") });
  await page.goto("/visual-fixture?mode=connect-repository-provider-blocked", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const surface = page.getByTestId("connect-repository-page");
  await expect(surface).toContainText(
    "Choose a Convex team and a Cloudflare account in Providers before connecting a repository.",
  );
  await expect(surface.getByRole("button", { name: "Connect" }).first()).toBeDisabled();
  await expect(surface).toHaveScreenshot("connect-repository-provider-blocked.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
});
