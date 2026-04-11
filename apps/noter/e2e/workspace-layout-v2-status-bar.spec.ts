import { expect, test, type Locator, type Page } from "@playwright/test";

// Linux CI and local macOS render this fixture differently, so keep explicit
// platform baselines instead of forcing one environment's layout on the other.
const workspaceLayoutStatusBarSnapshotSuffix =
  process.platform === "linux" ? "linux" : "darwin";

async function openWorkspaceLayoutStatusBarFixture(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture.html?mode=workspace-layout-v2-status-bar", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("workspace-layout-v2-visual-fixture");
  const leftSurface = page.getByTestId("workspace-layout-v2-prosemark-surface");
  const mainSurface = page.getByTestId(
    "workspace-layout-v2-main-editor-surface",
  );
  const rightSurface = page.getByTestId(
    "workspace-layout-v2-right-editor-surface",
  );
  const leftHeader = page.getByTestId("workspace-layout-v2-left-pane-header");
  const mainHeader = page.getByTestId("workspace-layout-v2-main-pane-header");
  const rightHeader = page.getByTestId("workspace-layout-v2-right-pane-header");
  const panelHeader = page.getByTestId("workspace-layout-v2-panel-pane-header");

  await expect(fixture).toBeVisible();
  await expect(leftHeader).toBeVisible();
  await expect(mainHeader).toBeVisible();
  await expect(rightHeader).toBeVisible();
  await expect(panelHeader).toBeVisible();
  await expect(leftSurface.locator(".cm-content")).toBeVisible();
  await expect(mainSurface.locator(".view-lines").first()).toBeVisible();
  await expect(rightSurface.locator(".view-lines").first()).toBeVisible();

  return {
    fixture,
    headers: [leftHeader, mainHeader, rightHeader, panelHeader],
  };
}

async function expectHeaderWithoutBottomBorder(header: Locator) {
  expect(
    await header.evaluate(
      (node) => window.getComputedStyle(node).borderBottomWidth,
    ),
  ).toBe("0px");
}

test("workspace layout v2 fixture renders the current pane chrome", async ({
  page,
}) => {
  const { fixture, headers } = await openWorkspaceLayoutStatusBarFixture(page);

  await Promise.all(headers.map(expectHeaderWithoutBottomBorder));

  await expect(fixture).toHaveScreenshot(
    `workspace-layout-v2-status-bar-${workspaceLayoutStatusBarSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.02,
    },
  );
});
