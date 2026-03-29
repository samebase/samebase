import { expect, test, type Page } from "@playwright/test";

test.use({
  hasTouch: true,
  isMobile: true,
});

async function gotoEditableFixture(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/visual-fixture.html?mode=fileview-prosemark-drag-editable",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");
}

async function dragEditableProsemarkSurfaceRight(page: Page) {
  const surface = page
    .getByTestId("fileview-prosemark-drag-surface")
    .locator('div[style*="touch-action"]');
  const bounds = await surface.boundingBox();

  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  const startX = bounds.x + bounds.width * 0.5;
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
        x: startX + 120,
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
        x: startX + 180,
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
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("editable ProseMark drag can open the left pane", async ({ page }) => {
  await gotoEditableFixture(page);

  const shell = page.getByTestId("fileview-prosemark-drag-shell");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");

  await dragEditableProsemarkSurfaceRight(page);

  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
});
