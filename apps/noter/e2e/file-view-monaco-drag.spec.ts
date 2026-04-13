import { expect, test, type Locator, type Page } from "@playwright/test";

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

function monacoDragShell(page: Page) {
  return page
    .getByTestId("fileview-monaco-drag-fixture-frame")
    .locator("[data-mobile-pane]")
    .first();
}

/**
 * Pace Monaco-owned CDP touch drags across a few frames so Linux CI does not
 * collapse the move/end samples into a single captured touchstart.
 */
async function dragMonacoSurface(
  page: Page,
  args: {
    deltaX: number;
    moveOffsetsX?: number[];
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
  const moveOffsetsX = args.moveOffsetsX ?? [args.deltaX * 0.66, args.deltaX];
  const session = await page.context().newCDPSession(page);
  const touchPoint = {
    force: 1,
    id: 1,
    radiusX: 4,
    radiusY: 4,
    x: startX,
    y: startY,
  };
  const dispatchTouchEvent = async (
    type: "touchEnd" | "touchMove" | "touchStart",
    touchPoints: (typeof touchPoint)[],
  ) => {
    await session.send("Input.dispatchTouchEvent", {
      timestamp: Date.now() / 1000,
      type,
      touchPoints,
    });
  };

  await dispatchTouchEvent("touchStart", [touchPoint]);
  for (const moveOffsetX of moveOffsetsX) {
    await page.waitForTimeout(24);
    await dispatchTouchEvent("touchMove", [
      {
        ...touchPoint,
        x: startX + moveOffsetX,
        y: startY + 6,
      },
    ]);
  }
  await page.waitForTimeout(24);
  await dispatchTouchEvent("touchEnd", []);
}

/**
 * The shell updates `data-mobile-pane` before its smooth scroll finishes, so
 * editor-originated swipes must wait for the left lane to finish snapping
 * first. Linux CI otherwise starts the Monaco touch sequence mid-animation and
 * can drop the follow-up move/end events entirely.
 */
async function waitForPaneToSettle(
  shell: Locator,
  expectedPane: "left" | "main" | "right",
) {
  await expect
    .poll(async () => {
      return shell.evaluate((element, pane) => {
        const maxScrollLeft = element.scrollWidth - element.clientWidth;

        if (pane === "left") {
          return Math.abs(element.scrollLeft);
        }

        if (pane === "right") {
          return Math.abs(maxScrollLeft - element.scrollLeft);
        }

        return Math.abs(element.scrollLeft - maxScrollLeft / 2);
      }, expectedPane);
    })
    .toBeLessThanOrEqual(1);
}

/**
 * `expectPaneAfterMonacoDrag` retries once from a fresh page when `rearm` is
 * provided because Linux CI can drop Monaco-owned move/end samples and leave
 * the shell in a stale `capturing` state from the first swipe attempt.
 */
async function expectPaneAfterMonacoDrag(args: {
  drag: () => Promise<void>;
  expectedPane: "left" | "main" | "right";
  page: Page;
  rearm?: () => Promise<void>;
}) {
  const shell = monacoDragShell(args.page);
  await args.drag();

  try {
    await expect(shell).toHaveAttribute("data-mobile-pane", args.expectedPane, {
      timeout: 1000,
    });
  } catch {
    if (args.rearm) {
      await args.rearm();
    }
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

  const shell = monacoDragShell(page);
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

  const shell = monacoDragShell(page);
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

// Keep this flow synchronized with the shell snap state before starting Monaco
// touch gestures; otherwise CI can miss move/end samples mid-animation.
test("Monaco drag can return from the open left pane to main", async ({
  page,
}) => {
  const shell = monacoDragShell(page);
  const overlay = page.getByTestId("workspace-sidebar-debug-overlay");
  const leftSidebarOnlyItem = page.getByText("src/notes.ts");
  const armReturnFromLeft = async () => {
    await gotoFixture(page, { swipeDebug: true });
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
    await waitForPaneToSettle(shell, "left");
    await expect(overlay).toBeVisible();
    await expect(leftSidebarOnlyItem).toBeInViewport();
  };

  await armReturnFromLeft();

  await expectPaneAfterMonacoDrag({
    drag: () =>
      dragMonacoSurface(page, {
        deltaX: -300,
        moveOffsetsX: [-60, -140, -220, -300],
        startX: "right-edge",
      }),
    expectedPane: "main",
    page,
    rearm: armReturnFromLeft,
  });

  await expect(overlay).toContainText("start: left");
  await expect(overlay).toContainText("settled: main");
  await expect(leftSidebarOnlyItem).not.toBeInViewport();

  const fixture = page.getByTestId("fileview-monaco-drag-visual-fixture");
  await expect(fixture).toHaveScreenshot(
    "fileview-monaco-drag-return-main.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.05,
    },
  );
});
