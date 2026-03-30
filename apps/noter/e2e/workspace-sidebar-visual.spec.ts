import { expect, test, type Page } from "@playwright/test";

async function gotoFileViewFixture(
  page: Page,
  options?: { swipeDebug?: boolean },
) {
  await page.setViewportSize({ width: 390, height: 844 });
  const debugQuery = options?.swipeDebug ? "&swipe-debug" : "";
  await page.goto(
    `/visual-fixture.html?mode=fileview-layout-persistence${debugQuery}`,
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");
}

async function swipeFromLeftSidebarToRightSidebar(page: Page) {
  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const bounds = await fixture.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  const startX = bounds.x + 282;
  const startY = bounds.y + 220;
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

  for (const step of [
    { delayMs: 35, xOffset: -44, yOffset: 2 },
    { delayMs: 45, xOffset: -128, yOffset: 4 },
    { delayMs: 50, xOffset: -208, yOffset: 5 },
    { delayMs: 50, xOffset: -258, yOffset: 6 },
  ]) {
    await page.waitForTimeout(step.delayMs);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          ...touchPoint,
          x: startX + step.xOffset,
          y: startY + step.yOffset,
        },
      ],
    });
  }

  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

test("fileview desktop left header with right tree", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/visual-fixture.html?mode=fileview-layout", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Toggle Left Sidebar" }).click();

  await expect(
    page.getByTestId("fileview-layout-visual-fixture"),
  ).toHaveScreenshot("fileview-layout-left-header-right-tree.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("fileview mobile sidebar scrim", async ({ page }) => {
  await gotoFileViewFixture(page);

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  const initialScrollLeft = await fixture.evaluate(
    (element) => element.scrollLeft,
  );
  await page
    .getByRole("button", { name: "Toggle Right Sidebar" })
    .press("Enter");
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(initialScrollLeft);
  const scrim = page
    .getByTestId("workspace-sidebar-main-scrim")
    .locator("div")
    .first();
  const header = page.getByTestId("fileview-layout-header");

  await expect
    .poll(async () =>
      scrim.evaluate((element) => window.getComputedStyle(element).touchAction),
    )
    .toBe("pan-x");
  await expect
    .poll(async () =>
      header.evaluate(
        (element) => window.getComputedStyle(element).scrollSnapStop,
      ),
    )
    .toBe("always");

  await expect(fixture).toHaveScreenshot("fileview-layout-mobile-scrim.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("fileview mobile swipe debug overlay path", async ({ page }) => {
  await gotoFileViewFixture(page, { swipeDebug: true });

  const fixture = page.getByTestId("fileview-layout-visual-fixture");
  await page
    .getByRole("button", { name: "Toggle Left Sidebar" })
    .press("Enter");
  await expect
    .poll(async () => fixture.evaluate((element) => element.scrollLeft))
    .toBeLessThanOrEqual(1);

  await swipeFromLeftSidebarToRightSidebar(page);
  await expect(fixture).toHaveAttribute("data-mobile-pane", "right");

  await page.addStyleTag({
    content:
      '[data-testid="workspace-sidebar-debug-overlay"] > div { display: none !important; }',
  });

  await expect(fixture).toHaveScreenshot(
    "fileview-layout-mobile-swipe-debug-overlay.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});
