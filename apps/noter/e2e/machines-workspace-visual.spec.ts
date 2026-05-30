import { devices, expect, test, type Locator, type Page } from "@playwright/test";

const { defaultBrowserType: _defaultBrowserType, ...iPhone13 } = devices["iPhone 13"];

async function pressEnter(locator: Locator) {
  await locator.focus();
  await locator.press("Enter");
}

async function narrowLeftSidebar(page: Page) {
  const handle = page.getByTestId("workspace-layout-v2-left-resize");
  await handle.focus();

  for (let step = 0; step < 7; step += 1) {
    await handle.press("ArrowLeft");
  }
}

async function openMachinesWorkspaceFixture(page: Page) {
  await page.goto("/visual-fixture?mode=machines-workspace", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

test("machines workspace fixture", async ({ page }) => {
  await openMachinesWorkspaceFixture(page);

  const leftPane = page.getByTestId("workspace-layout-v2-pane-left");
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");
  await expect(leftPane.getByRole("button", { name: "Home", exact: true })).toHaveCount(0);
  await expect(leftPane.getByRole("button", { name: "Open user menu", exact: true })).toHaveCount(
    0,
  );
  await expect(leftPane.getByRole("link", { name: "/home", exact: true })).toHaveCount(0);
  await expect(rightPane.getByRole("link", { name: "/home", exact: true })).toHaveCount(1);

  const workspace = page.getByTestId("machines-workspace-visual-fixture-page");
  await expect(workspace).toHaveScreenshot("machines-workspace-page.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("machines workspace narrow sidebar keeps thread titles clamped", async ({ page }) => {
  await openMachinesWorkspaceFixture(page);

  await narrowLeftSidebar(page);

  const sidebar = page.getByTestId("machines-workspace-visual-fixture-sidebar");
  await expect(sidebar).toHaveScreenshot("machines-workspace-page-narrow.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("machines workspace project collapse stays closed", async ({ page }) => {
  await openMachinesWorkspaceFixture(page);

  const projectToggle = page.getByRole("button", {
    name: "noter",
    exact: true,
  });
  const projectThread = page.getByRole("button", {
    name: /Research sidebar resizing/,
  });

  await expect(projectThread).toBeVisible();
  await pressEnter(projectToggle);
  await expect(projectThread).toBeHidden();

  await page.waitForTimeout(1200);
  await expect(projectThread).toBeHidden();
});

test("machines workspace desktop hover reveals the pin affordance", async ({ page }) => {
  await openMachinesWorkspaceFixture(page);

  await page
    .getByRole("button", {
      name: /Research sidebar resizing/,
    })
    .hover({ force: true });

  const sidebar = page.getByTestId("machines-workspace-visual-fixture-sidebar");
  await expect(sidebar).toHaveScreenshot("machines-workspace-pin-hover.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("machines workspace machine collapse stays closed", async ({ page }) => {
  await openMachinesWorkspaceFixture(page);

  const secondMachineToggle = page.getByRole("button", {
    name: /Research Windows Workstation/,
  });
  const secondMachineThread = page.getByRole("button", {
    name: /Investigate flaky screenshot test/,
  });

  await expect(secondMachineThread).toBeHidden();
  await pressEnter(secondMachineToggle);
  await expect(secondMachineThread).toBeVisible();
  await pressEnter(secondMachineToggle);
  await expect(secondMachineThread).toBeHidden();

  await page.waitForTimeout(1200);
  await expect(secondMachineThread).toBeHidden();
});

test("machines workspace project plus button opens a local draft conversation", async ({
  page,
}) => {
  await openMachinesWorkspaceFixture(page);

  await pressEnter(page.getByRole("button", { name: "Start new conversation in noter" }));
  await pressEnter(page.getByRole("menuitem", { name: "Local" }));

  await expect(
    page.getByText("Send the first prompt to start a local conversation in noter.").first(),
  ).toBeVisible();
});

test("machines workspace project plus button opens a worktree draft conversation", async ({
  page,
}) => {
  await openMachinesWorkspaceFixture(page);

  await pressEnter(page.getByRole("button", { name: "Start new conversation in noter" }));
  await pressEnter(page.getByRole("menuitem", { name: "New worktree" }));

  await expect(
    page.getByText("Send the first prompt to create a new worktree conversation in noter.").first(),
  ).toBeVisible();
});

test.describe("mobile", () => {
  test.use(iPhone13);

  test("machines workspace fixture mobile", async ({ page }) => {
    await openMachinesWorkspaceFixture(page);

    const workspace = page.getByTestId("machines-workspace-visual-fixture-page");
    await expect(workspace).toHaveScreenshot("machines-workspace-page-mobile.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    });
  });

  test("machines workspace mobile selected row reveals the pin affordance", async ({ page }) => {
    await openMachinesWorkspaceFixture(page);

    await pressEnter(
      page.getByRole("button", {
        name: /Research sidebar resizing/,
      }),
    );

    const sidebar = page.getByTestId("machines-workspace-visual-fixture-sidebar");
    await expect(sidebar).toHaveScreenshot("machines-workspace-pin-selected-mobile.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    });
  });
});
