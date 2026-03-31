import { expect, test, type Page } from "@playwright/test";

test.use({
  hasTouch: true,
  isMobile: true,
});

async function gotoEditableFixture(page: Page) {
  await gotoFixture(page, "fileview-prosemark-drag-editable");
}

async function gotoReadOnlyFixture(page: Page) {
  await gotoFixture(page, "fileview-prosemark-drag-read-only");
}

async function gotoFixture(
  page: Page,
  mode:
    | "fileview-prosemark-drag-editable"
    | "fileview-prosemark-drag-read-only",
  options?: {
    swipeDebug?: boolean;
  },
) {
  const debugQuery = options?.swipeDebug ? "&swipe-debug" : "";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/visual-fixture.html?mode=${mode}${debugQuery}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
}

async function dragProsemarkSurface(
  page: Page,
  args: {
    deltaX: number;
    startX: "center" | "right-edge";
  },
) {
  const surface = page
    .getByTestId("fileview-prosemark-drag-surface")
    .locator('div[style*="touch-action"]');
  const bounds = await surface.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  const viewportWidth = page.viewportSize()?.width ?? 390;
  const startX =
    args.startX === "right-edge"
      ? Math.min(bounds.x + bounds.width - 28, viewportWidth - 20)
      : bounds.x + bounds.width * 0.5;
  const startY = bounds.y + Math.min(120, bounds.height * 0.35);
  const session = await page.context().newCDPSession(page);

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      {
        force: 1,
        id: 1,
        radiusX: 4,
        radiusY: 4,
        x: startX,
        y: startY,
      },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        force: 1,
        id: 1,
        radiusX: 4,
        radiusY: 4,
        x: startX + args.deltaX * 0.66,
        y: startY + 4,
      },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        force: 1,
        id: 1,
        radiusX: 4,
        radiusY: 4,
        x: startX + args.deltaX,
        y: startY + 6,
      },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

test("editable ProseMark mobile drag fixture", async ({ page }) => {
  await gotoEditableFixture(page);
  const fixture = page.getByTestId("fileview-prosemark-drag-visual-fixture");

  await expect(fixture).toHaveScreenshot(
    "fileview-prosemark-drag-editable.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      // ProseMark text rasterization shifts slightly between local macOS runs
      // and the Linux CI browser, while the overall shell layout stays stable.
      maxDiffPixelRatio: 0.05,
    },
  );
});

test("editable ProseMark drag can open the left pane", async ({ page }) => {
  await gotoEditableFixture(page);

  const shell = page.getByTestId("fileview-prosemark-drag-shell");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");

  await dragProsemarkSurface(page, {
    deltaX: 180,
    startX: "center",
  });

  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
});

test("read-only ProseMark drag can open the left pane", async ({ page }) => {
  await gotoReadOnlyFixture(page);

  const shell = page.getByTestId("fileview-prosemark-drag-shell");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");

  await dragProsemarkSurface(page, {
    deltaX: 180,
    startX: "center",
  });

  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
});

test("editable ProseMark drag can return from the open left pane to main", async ({
  page,
}) => {
  await gotoFixture(page, "fileview-prosemark-drag-editable", {
    swipeDebug: true,
  });

  const shell = page.getByTestId("fileview-prosemark-drag-shell");
  const overlay = page.getByTestId("workspace-sidebar-debug-overlay");
  const leftSidebarOnlyItem = page.getByText("docs/notes.md");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");
  await page
    .getByRole("button", { name: "Toggle Left Sidebar" })
    .press("Enter");
  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
  await expect(overlay).toBeVisible();
  await expect(leftSidebarOnlyItem).toBeInViewport();

  await dragProsemarkSurface(page, {
    deltaX: -132,
    startX: "right-edge",
  });

  await expect(overlay).toContainText("start: left");
  await expect(overlay).toContainText("settled: main");
  await expect(leftSidebarOnlyItem).not.toBeInViewport();
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");
});
