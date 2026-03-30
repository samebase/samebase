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

async function dragMonacoSurface(page: Page, deltaX: number) {
  const surface = page.getByTestId("fileview-monaco-drag-surface");
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
        x: startX + deltaX * 0.66,
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
        x: startX + deltaX,
        y: startY + 6,
      },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
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

  await dragMonacoSurface(page, 180);

  await expect(shell).toHaveAttribute("data-mobile-pane", "left");
});

test("Monaco drag can open the right pane", async ({ page }) => {
  await gotoFixture(page);

  const shell = page.getByTestId("fileview-monaco-drag-shell");
  await expect(shell).toHaveAttribute("data-mobile-pane", "main");

  await dragMonacoSurface(page, -180);

  await expect(shell).toHaveAttribute("data-mobile-pane", "right");
});
