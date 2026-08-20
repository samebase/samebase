import { expect, test } from "./visualFixtureTest";

test("connect repository GitHub blocker", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 520 });
  await page.clock.install({ time: Date.parse("2026-08-06T12:00:00Z") });
  await page.goto("/visual-fixture?mode=connect-repository-github-unavailable", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const surface = page.getByTestId("connect-repository-page");
  await expect(surface).toContainText(
    "Connect GitHub in Providers before connecting a repository.",
  );
  await expect(surface.getByRole("button", { name: "Connect" }).first()).toBeDisabled();
  await expect(surface).toHaveScreenshot("connect-repository-github-unavailable.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
});
