import { expect, test, type Page } from "@playwright/test";

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 844 },
});

async function gotoFixture(
  page: Page,
  options?: {
    swipeDebug?: boolean;
  },
) {
  const debugQuery = options?.swipeDebug ? "&swipe-debug" : "";
  await page.goto(
    `/visual-fixture.html?mode=fileview-prosemark-flex-height${debugQuery}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");
}

async function dragProsemarkSurface(
  page: Page,
  args: {
    deltaX: number;
    startX: "center" | "left-edge";
  },
) {
  const surface = page.getByTestId("fileview-prosemark-height-surface");
  const bounds = await surface.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  const viewportWidth = page.viewportSize()?.width ?? 390;
  const startX =
    args.startX === "left-edge"
      ? Math.max(bounds.x + 24, 20)
      : Math.min(bounds.x + bounds.width * 0.5, viewportWidth - 20);
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

async function expectPaneAfterProsemarkDrag(args: {
  drag: () => Promise<void>;
  expectedPane: "main" | "right";
  page: Page;
}) {
  const shell = args.page.getByTestId("fileview-prosemark-height-shell");
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

async function collectTouchMoveInterventionWarnings<T>(
  page: Page,
  action: () => Promise<T>,
) {
  const warnings: string[] = [];
  const handleConsoleMessage = (message: { text: () => string }) => {
    const text = message.text();
    if (
      text.includes(
        "Ignored attempt to cancel a touchmove event with cancelable=false",
      )
    ) {
      warnings.push(text);
    }
  };

  page.on("console", handleConsoleMessage);
  try {
    await action();
    return warnings;
  } finally {
    page.off("console", handleConsoleMessage);
  }
}

test("dragging left on the real prose file surface opens the file tree pane", async ({
  page,
}) => {
  await gotoFixture(page);

  const shell = page.getByTestId("fileview-prosemark-height-shell");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");

  await expectPaneAfterProsemarkDrag({
    drag: () =>
      dragProsemarkSurface(page, {
        deltaX: -180,
        startX: "center",
      }),
    expectedPane: "right",
    page,
  });
});

test("mobile prose drags do not log non-cancelable touchmove intervention warnings", async ({
  page,
}) => {
  await gotoFixture(page);

  const shell = page.getByTestId("fileview-prosemark-height-shell");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");

  const warnings = await collectTouchMoveInterventionWarnings(
    page,
    async () => {
      await expectPaneAfterProsemarkDrag({
        drag: () =>
          dragProsemarkSurface(page, {
            deltaX: -180,
            startX: "center",
          }),
        expectedPane: "right",
        page,
      });

      await expectPaneAfterProsemarkDrag({
        drag: () =>
          dragProsemarkSurface(page, {
            deltaX: 140,
            startX: "left-edge",
          }),
        expectedPane: "main",
        page,
      });
    },
  );

  expect(warnings).toEqual([]);
});

test("dragging right from the open file tree pane returns to main", async ({
  page,
}) => {
  await gotoFixture(page, {
    swipeDebug: true,
  });

  const shell = page.getByTestId("fileview-prosemark-height-shell");
  const overlay = page.getByTestId("workspace-sidebar-debug-overlay");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");
  await page
    .getByRole("button", { name: "Toggle Right Sidebar" })
    .press("Enter");
  await expect(shell).toHaveAttribute("data-mobile-pane", "right");
  await expect(overlay).toBeVisible();

  await expectPaneAfterProsemarkDrag({
    drag: () =>
      dragProsemarkSurface(page, {
        deltaX: 140,
        startX: "left-edge",
      }),
    expectedPane: "main",
    page,
  });

  await expect(overlay).toContainText("start: right");
  await expect(overlay).toContainText("settled: main");
});
