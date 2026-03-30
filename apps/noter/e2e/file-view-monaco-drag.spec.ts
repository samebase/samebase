import { expect, test, type Page } from "@playwright/test";

test.use({
  hasTouch: true,
  isMobile: true,
});

async function gotoFixture(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixture.html?mode=fileview-monaco-drag", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByTestId("fileview-monaco-drag-surface").locator(".monaco-editor"),
  ).toBeVisible();
}

async function dragMonacoSurface(
  page: Page,
  args: {
    deltaX: number;
    startXRatio: number;
  },
) {
  const surface = page.getByTestId("fileview-monaco-drag-surface");
  const bounds = await surface.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  const startX = bounds.x + bounds.width * args.startXRatio;
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
        startXRatio: 0.25,
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
        startXRatio: 0.75,
      }),
    expectedPane: "right",
    page,
  });
});
