import { devices, expect, test, type Page } from "@playwright/test";

const { defaultBrowserType: _pixel7BrowserType, ...pixel7Device } =
  devices["Pixel 7"];

async function gotoFileViewFixture(
  page: Page,
  options?: { swipeDebug?: boolean },
) {
  const debugQuery = options?.swipeDebug ? "&swipe-debug" : "";
  await page.goto(
    `/visual-fixture.html?mode=fileview-layout-persistence${debugQuery}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");
}

async function dispatchHumanTouchSwipe(
  page: Page,
  args: {
    startX: number;
    startY: number;
    steps: ReadonlyArray<{
      delayMs: number;
      xOffset: number;
      yOffset: number;
    }>;
  },
) {
  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const bounds = await fixture.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  const session = await page.context().newCDPSession(page);
  const gestureStartTimeMs = Date.now();
  let elapsedMs = 0;
  const touchPoint = {
    force: 1,
    id: 1,
    radiusX: 4,
    radiusY: 4,
    x: bounds.x + args.startX,
    y: bounds.y + args.startY,
  };

  await session.send("Input.dispatchTouchEvent", {
    timestamp: gestureStartTimeMs / 1000,
    type: "touchStart",
    touchPoints: [touchPoint],
  });

  for (const step of args.steps) {
    const rawX = bounds.x + args.startX + step.xOffset;
    const rawY = bounds.y + args.startY + step.yOffset;
    const clampedX = Math.min(
      Math.max(rawX, bounds.x),
      bounds.x + bounds.width,
    );
    const clampedY = Math.min(
      Math.max(rawY, bounds.y),
      bounds.y + bounds.height,
    );
    const reachedBounds = clampedX !== rawX || clampedY !== rawY;

    await page.waitForTimeout(step.delayMs);
    elapsedMs += step.delayMs;
    await session.send("Input.dispatchTouchEvent", {
      timestamp: (gestureStartTimeMs + elapsedMs) / 1000,
      type: "touchMove",
      touchPoints: [
        {
          ...touchPoint,
          x: clampedX,
          y: clampedY,
        },
      ],
    });

    if (reachedBounds) {
      break;
    }
  }

  await session.send("Input.dispatchTouchEvent", {
    timestamp: (gestureStartTimeMs + elapsedMs + 1) / 1000,
    type: "touchEnd",
    touchPoints: [],
  });
}

async function getFixtureViewportClip(page: Page) {
  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const bounds = await fixture.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error(
      "Expected fileview layout fixture bounds for screenshot clip",
    );
  }

  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  };
}

function getFileViewLayoutShell(page: Page) {
  return page.locator("[data-mobile-pane]").first();
}

function boxesIntersect(
  firstBox: {
    height: number;
    width: number;
    x: number;
    y: number;
  },
  secondBox: {
    height: number;
    width: number;
    x: number;
    y: number;
  },
) {
  return !(
    firstBox.x + firstBox.width <= secondBox.x ||
    secondBox.x + secondBox.width <= firstBox.x ||
    firstBox.y + firstBox.height <= secondBox.y ||
    secondBox.y + secondBox.height <= firstBox.y
  );
}

async function swipeFromLeftSidebarTowardRight(page: Page) {
  await dispatchHumanTouchSwipe(page, {
    startX: 320,
    startY: 220,
    steps: [
      { delayMs: 25, xOffset: -72, yOffset: 2 },
      { delayMs: 30, xOffset: -208, yOffset: 4 },
      { delayMs: 30, xOffset: -312, yOffset: 5 },
      { delayMs: 25, xOffset: -352, yOffset: 6 },
    ],
  });
}

async function swipeFromMainToLeftSidebar(page: Page) {
  await dispatchHumanTouchSwipe(page, {
    startX: 150,
    startY: 220,
    steps: [
      { delayMs: 50, xOffset: 28, yOffset: 2 },
      { delayMs: 60, xOffset: 74, yOffset: 4 },
      { delayMs: 60, xOffset: 126, yOffset: 5 },
      { delayMs: 70, xOffset: 174, yOffset: 6 },
    ],
  });
}

async function swipeFromMainToRightSidebar(page: Page) {
  await dispatchHumanTouchSwipe(page, {
    startX: 280,
    startY: 220,
    steps: [
      { delayMs: 50, xOffset: -28, yOffset: 2 },
      { delayMs: 60, xOffset: -74, yOffset: 4 },
      { delayMs: 60, xOffset: -126, yOffset: 5 },
      { delayMs: 70, xOffset: -174, yOffset: 6 },
    ],
  });
}

test("fileview desktop shell with right tree", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=fileview-layout", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  await expect(
    page.getByRole("button", { name: "Open bottom panel" }),
  ).toBeVisible();

  await expect(fixture).toHaveScreenshot(
    "fileview-layout-shell-right-tree.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test.describe("fileview mobile", () => {
  test.use({
    ...pixel7Device,
  });

  test("sidebar keeps the visible main pane unobscured", async ({ page }) => {
    await gotoFileViewFixture(page);

    const fixture = page.getByTestId("fileview-layout-visual-fixture");
    const shell = getFileViewLayoutShell(page);
    const bodyButton = page.getByTestId("fileview-layout-body-button");
    await swipeFromMainToRightSidebar(page);
    await expect(shell).toHaveAttribute("data-mobile-pane", "right");
    const header = page.getByTestId("fileview-layout-header");

    await expect(page.getByTestId("workspace-sidebar-main-scrim")).toHaveCount(
      0,
    );
    await expect(bodyButton).toBeVisible();
    await expect
      .poll(async () =>
        header.evaluate(
          (element) => window.getComputedStyle(element).scrollSnapStop,
        ),
      )
      .toBe("always");

    await expect(fixture).toHaveScreenshot(
      "fileview-layout-mobile-sidebar-open.png",
      {
        animations: "disabled",
        caret: "hide",
        scale: "css",
        maxDiffPixelRatio: 0.03,
      },
    );
  });

  test("swipe debug overlay path from main to left", async ({ page }) => {
    await gotoFileViewFixture(page, { swipeDebug: true });

    const shell = getFileViewLayoutShell(page);
    const overlay = page.getByTestId("workspace-sidebar-debug-overlay");
    const debugPanel = page.getByTestId("workspace-sidebar-debug-panel");
    await expect(overlay).toBeVisible();
    await expect(debugPanel).toBeVisible();
    const overlayBox = await debugPanel.boundingBox();
    const quickOpenButtonBox = await page
      .getByRole("button", { name: "Quick Open" })
      .boundingBox();

    expect(overlayBox).not.toBeNull();
    expect(quickOpenButtonBox).not.toBeNull();
    if (overlayBox !== null && quickOpenButtonBox !== null) {
      expect(boxesIntersect(overlayBox, quickOpenButtonBox)).toBe(false);
    }

    await swipeFromMainToLeftSidebar(page);
    await expect(shell).toHaveAttribute("data-mobile-pane", "left");
    await expect(overlay).toContainText("pane: left");

    await expect(page).toHaveScreenshot(
      "fileview-layout-mobile-swipe-debug-main-to-left.png",
      {
        animations: "disabled",
        caret: "hide",
        clip: await getFixtureViewportClip(page),
        fullPage: false,
        scale: "css",
        maxDiffPixelRatio: 0.03,
      },
    );
  });

  test("swipe debug overlay path from left back to main", async ({ page }) => {
    await gotoFileViewFixture(page, { swipeDebug: true });

    const shell = getFileViewLayoutShell(page);
    const overlay = page.getByTestId("workspace-sidebar-debug-overlay");
    await expect(overlay).toBeVisible();
    await swipeFromMainToLeftSidebar(page);
    await expect(shell).toHaveAttribute("data-mobile-pane", "left");
    await expect(overlay).toContainText("pane: left");

    await swipeFromLeftSidebarTowardRight(page);
    await expect(shell).toHaveAttribute("data-mobile-pane", "main");
    await expect(overlay).toContainText("pane: main");

    await expect(page).toHaveScreenshot(
      "fileview-layout-mobile-swipe-debug-left-to-main.png",
      {
        animations: "disabled",
        caret: "hide",
        clip: await getFixtureViewportClip(page),
        fullPage: false,
        scale: "css",
        maxDiffPixelRatio: 0.03,
      },
    );
  });
});
