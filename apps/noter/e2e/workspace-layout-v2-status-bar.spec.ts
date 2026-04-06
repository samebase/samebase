import { expect, test, type Page } from "@playwright/test";

async function openWorkspaceLayoutStatusBarFixture(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture.html?mode=workspace-layout-v2-status-bar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("workspace-layout-v2-visual-fixture");
  const statusBar = page.getByTestId("workspace-layout-v2-top-bar");
  const leftSurface = page.getByTestId("workspace-layout-v2-prosemark-surface");
  const mainSurface = page.getByTestId(
    "workspace-layout-v2-main-editor-surface",
  );
  const rightSurface = page.getByTestId(
    "workspace-layout-v2-right-editor-surface",
  );

  await expect(fixture).toBeVisible();
  await expect(statusBar).toBeVisible();
  await expect(statusBar).toContainText("Workspace layout top bar");
  await expect(statusBar).toContainText("fixture");
  await expect(statusBar).toContainText("chrome");
  await expect(leftSurface.locator(".cm-content")).toBeVisible();
  await expect(mainSurface.locator(".view-lines").first()).toBeVisible();
  await expect(rightSurface.locator(".view-lines").first()).toBeVisible();

  return fixture;
}

test("workspace layout v2 fixture can include the shared top bar chrome", async ({
  page,
}) => {
  const fixture = await openWorkspaceLayoutStatusBarFixture(page);

  await expect(fixture).toHaveScreenshot("workspace-layout-v2-status-bar.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.02,
  });
});
