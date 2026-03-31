import { expect, test, type Page } from "@playwright/test";

async function openResearchFixture(page: Page) {
  await page.goto("/visual-fixture.html?mode=codex-app-server-research", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

test("codex app-server research visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1480, height: 2200 });
  await openResearchFixture(page);
  await expect(
    page.getByTestId("codex-app-server-research-visual-fixture"),
  ).toHaveScreenshot("codex-app-server-research.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.06,
  });
});
