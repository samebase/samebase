import { devices, expect, test, type Page } from "@playwright/test";

const machinesWorkspaceSnapshotSuffix = process.platform;
const { defaultBrowserType: _defaultBrowserType, ...iPhone13 } =
  devices["iPhone 13"];

async function getBox(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  const box = await locator.boundingBox();

  if (box === null) {
    throw new Error(`Expected ${testId} to have a bounding box.`);
  }

  return box;
}

async function dragHorizontalHandle(
  page: Page,
  testId: string,
  deltaXPx: number,
) {
  const handleBox = await getBox(page, testId);
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaXPx, startY, {
    steps: 8,
  });
  await page.mouse.up();
}

async function openMachinesWorkspaceFixture(page: Page) {
  await page.goto("/visual-fixture.html?mode=machines-workspace", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

async function openMachinesThreadRowFixture(
  page: Page,
  mode:
    | "machines-thread-row"
    | "machines-thread-row-ready"
    | "machines-thread-row-draft" = "machines-thread-row",
) {
  await page.goto(`/visual-fixture.html?mode=${mode}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

test("machines workspace fixture", async ({ page }) => {
  await openMachinesWorkspaceFixture(page);

  const header = page.getByTestId("machines-workspace-visual-fixture-header");
  await expect(header).toHaveScreenshot(
    `machines-workspace-header-${machinesWorkspaceSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );

  const workspace = page.getByTestId("machines-workspace-visual-fixture");
  await expect(workspace).toHaveScreenshot(
    `machines-workspace-page-${machinesWorkspaceSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("machines workspace thread row fixture", async ({ page }) => {
  await openMachinesThreadRowFixture(page);

  const row = page.getByTestId("machines-thread-row-visual-fixture");
  await expect(row).toHaveScreenshot(
    `machines-workspace-thread-row-${machinesWorkspaceSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("machines workspace thread row ready pr fixture", async ({ page }) => {
  await openMachinesThreadRowFixture(page, "machines-thread-row-ready");

  const row = page.getByTestId("machines-thread-row-visual-fixture");
  await expect(row).toHaveScreenshot(
    `machines-workspace-thread-row-ready-${machinesWorkspaceSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("machines workspace thread row draft fixture", async ({ page }) => {
  await openMachinesThreadRowFixture(page, "machines-thread-row-draft");

  const row = page.getByTestId("machines-thread-row-visual-fixture");
  await expect(row).toHaveScreenshot(
    `machines-workspace-thread-row-draft-${machinesWorkspaceSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("machines workspace narrow sidebar keeps thread titles clamped", async ({
  page,
}) => {
  await openMachinesWorkspaceFixture(page);

  await dragHorizontalHandle(
    page,
    "workspace-sidebar-left-resize-handle",
    -160,
  );

  const sidebar = page.getByTestId("machines-workspace-visual-fixture-sidebar");
  await expect(sidebar).toHaveScreenshot(
    `machines-workspace-page-narrow-${machinesWorkspaceSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("machines workspace project collapse stays closed", async ({ page }) => {
  await openMachinesWorkspaceFixture(page);

  const sidebar = page.getByTestId("machines-workspace-visual-fixture-sidebar");
  const projectToggle = sidebar.getByRole("button", { name: /^noter$/ });
  const projectThread = page.getByRole("button", {
    name: /Research sidebar resizing/,
  });

  await expect(projectThread).toBeVisible();
  await projectToggle.click();
  await expect(projectThread).toBeHidden();

  await page.waitForTimeout(1200);
  await expect(projectThread).toBeHidden();
});

test("machines workspace desktop hover reveals the pin affordance", async ({
  page,
}) => {
  await openMachinesWorkspaceFixture(page);

  await page
    .getByRole("button", {
      name: /Research sidebar resizing/,
    })
    .hover();

  const sidebar = page.getByTestId("machines-workspace-visual-fixture-sidebar");
  await expect(sidebar).toHaveScreenshot(
    `machines-workspace-pin-hover-${machinesWorkspaceSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
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
  await secondMachineToggle.click();
  await expect(secondMachineThread).toBeVisible();
  await secondMachineToggle.click();
  await expect(secondMachineThread).toBeHidden();

  await page.waitForTimeout(1200);
  await expect(secondMachineThread).toBeHidden();
});

test("machines workspace project plus button opens a local draft conversation", async ({
  page,
}) => {
  await openMachinesWorkspaceFixture(page);

  await page
    .getByRole("button", { name: "Start new conversation in noter" })
    .click();
  await page.getByRole("menuitem", { name: "Local" }).click();

  await expect(
    page
      .getByText(
        "Send the first prompt to start a local conversation in noter.",
      )
      .first(),
  ).toBeVisible();
});

test("machines workspace project plus button opens a worktree draft conversation", async ({
  page,
}) => {
  await openMachinesWorkspaceFixture(page);

  await page
    .getByRole("button", { name: "Start new conversation in noter" })
    .click();
  await page.getByRole("menuitem", { name: "New worktree" }).click();

  await expect(
    page
      .getByText(
        "Send the first prompt to create a new worktree conversation in noter.",
      )
      .first(),
  ).toBeVisible();
});

test.describe("mobile", () => {
  test.use(iPhone13);

  test("machines workspace fixture mobile", async ({ page }) => {
    await openMachinesWorkspaceFixture(page);

    const header = page.getByTestId("machines-workspace-visual-fixture-header");
    await expect(header).toHaveScreenshot(
      `machines-workspace-header-mobile-${machinesWorkspaceSnapshotSuffix}.png`,
      {
        animations: "disabled",
        caret: "hide",
        scale: "css",
        maxDiffPixelRatio: 0.03,
      },
    );

    const workspace = page.getByTestId("machines-workspace-visual-fixture");
    await expect(workspace).toHaveScreenshot(
      `machines-workspace-page-mobile-${machinesWorkspaceSnapshotSuffix}.png`,
      {
        animations: "disabled",
        caret: "hide",
        scale: "css",
        maxDiffPixelRatio: 0.03,
      },
    );
  });

  test("machines workspace mobile selected row reveals the pin affordance", async ({
    page,
  }) => {
    await openMachinesWorkspaceFixture(page);

    await page
      .getByRole("button", {
        name: /Research sidebar resizing/,
      })
      .click();

    const sidebar = page.getByTestId(
      "machines-workspace-visual-fixture-sidebar",
    );
    await expect(sidebar).toHaveScreenshot(
      `machines-workspace-pin-selected-mobile-${machinesWorkspaceSnapshotSuffix}.png`,
      {
        animations: "disabled",
        caret: "hide",
        scale: "css",
        maxDiffPixelRatio: 0.03,
      },
    );
  });
});
