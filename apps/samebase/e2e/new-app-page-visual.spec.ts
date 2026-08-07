import { expect, test } from "./visualFixtureTest";

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
