import { expect, test } from "./visualFixtureTest";

test("exact public repository alongside the recent preview", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 });
  await page.goto("/visual-fixture?mode=connect-repository-exact-public", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const content = page
    .getByRole("heading", { name: "Connect an existing repository" })
    .locator("xpath=../../..");
  await expect(page.getByPlaceholder("Search or enter owner/repo...")).toHaveValue(
    "samebase/samebase",
  );
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toHaveCount(11);

  await expect(content).toHaveScreenshot("connect-repository-exact-public.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});
