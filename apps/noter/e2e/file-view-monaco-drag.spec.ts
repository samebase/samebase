import { expect, test, type Page } from "@playwright/test";

test.use({
  hasTouch: true,
  isMobile: true,
});

async function gotoFixture(
  page: Page,
  options?: {
    swipeDebug?: boolean;
  },
) {
  const debugQuery = options?.swipeDebug ? "&swipe-debug" : "";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `/visual-fixture.html?mode=fileview-monaco-drag${debugQuery}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByTestId("fileview-monaco-drag-surface").locator(".monaco-editor"),
  ).toBeVisible();
}

async function dragMonacoSurface(
  page: Page,
  args: {
    deltaX: number;
    startX: "center" | "right-edge";
  },
) {
  const surface = page.getByTestId("fileview-monaco-drag-surface");
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
  const touchPoint = {
    force: 1,
    id: 1,
    radiusX: 4,
    radiusY: 4,
    x: startX,
    y: startY,
  };

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touchPoint],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        ...touchPoint,
        x: startX + args.deltaX * 0.66,
        y: startY + 4,
      },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      {
        ...touchPoint,
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

async function expectPaneAfterMonacoDrag(args: {
  drag: () => Promise<void>;
  expectedPane: "left" | "right";
  page: Page;
}) {
  const shell = args.page.getByTestId("fileview-monaco-drag-shell");
  await args.drag();

  try {
    await expect(shell).toHaveAttribute("data-mobile-pane", args.expectedPane, {
      timeout: 1000,
    });
  } catch {
    await args.drag();
    await expect(shell).toHaveAttribute("data-mobile-pane", args.expectedPane);
  }
}

test("Monaco mobile drag fixture", async ({ page }) => {
  await gotoFixture(page);
  const fixture = page.getByTestId("fileview-monaco-drag-visual-fixture");

  await expect(fixture).toHaveScreenshot("fileview-monaco-drag.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.05,
  });
});

test("Monaco drag can open the left pane", async ({ page }) => {
  await gotoFixture(page);

  const shell = page.getByTestId("fileview-monaco-drag-shell");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");

  await expectPaneAfterMonacoDrag({
    drag: () =>
      dragMonacoSurface(page, {
        deltaX: 272,
        startX: "center",
      }),
    expectedPane: "left",
    page,
  });
});

test("Monaco drag can open the right pane", async ({ page }) => {
  await gotoFixture(page);

  const shell = page.getByTestId("fileview-monaco-drag-shell");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");

  await expectPaneAfterMonacoDrag({
    drag: () =>
      dragMonacoSurface(page, {
        deltaX: -280,
        startX: "center",
      }),
    expectedPane: "right",
    page,
  });
});

test("Monaco drag can return from the open left pane to main", async ({
  page,
}) => {
  await gotoFixture(page, { swipeDebug: true });

  const shell = page.getByTestId("fileview-monaco-drag-shell");
  const overlay = page.getByTestId("workspace-sidebar-debug-overlay");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");
  await page
    .getByRole("button", { name: "Toggle Left Sidebar" })
    .press("Enter");
  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
  await expect(overlay).toBeVisible();

  await dragMonacoSurface(page, {
    deltaX: -132,
    startX: "right-edge",
  });

  await expect(overlay).toContainText("state: captured");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");
});
