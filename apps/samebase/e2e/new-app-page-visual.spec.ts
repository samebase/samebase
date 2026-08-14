import { expect, test } from "./visualFixtureTest";

test("new app Workers Builds token", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 520 });
  await page.goto("/visual-fixture?mode=new-app-build-token", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const surface = page.getByTestId("new-app-build-token");
  await expect(surface.getByText("Workers Builds token")).toBeVisible();
  await expect(surface.getByRole("combobox", { name: "Workers Builds token" })).toContainText(
    "Workers Builds - 2026-08-14 01:54",
  );
  await expect(surface).toContainText(
    "Samebase will assign the selected token to production and preview builds, then request a production build.",
  );
  await expect(surface).toHaveScreenshot("new-app-build-token.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
});

test("new app provider blocker", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 320 });
  await page.goto("/visual-fixture?mode=new-app-provider-blocked", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const surface = page.getByTestId("new-app-provider-blocked");
  await expect(surface).toContainText("Connected to team acme-platform.");
  await expect(surface).toContainText("Disconnected from account acme-production.");
  await expect(surface).toContainText(
    "An organization owner must reconnect Cloudflare before an app can be created.",
  );
  await expect(surface.getByRole("button", { name: "New App" })).toBeDisabled();
  await expect(surface).toHaveScreenshot("new-app-provider-blocked.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
});
