import { expect, test, type Locator, type Page } from "@playwright/test";

type ScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

async function readScrollMetrics(locator: Locator): Promise<ScrollMetrics> {
  return locator.evaluate((node) => {
    if (!(node instanceof HTMLElement)) {
      throw new Error("Expected an HTML element scroll container.");
    }
    return {
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    };
  });
}

function workspaceScrollContainer(surface: Locator) {
  return surface.locator(
    "xpath=ancestor::div[contains(@class, 'overflow-y-auto')][1]",
  );
}

async function wheelSurface(page: Page, surface: Locator) {
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + Math.min(bounds.height / 2, 180),
  );
  await page.mouse.wheel(0, 1200);
  await page.mouse.wheel(0, 1200);
}

async function swipeSurface(page: Page, surface: Locator) {
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }

  const viewportHeight = page.viewportSize()?.height ?? 844;
  const startPoint = await page.evaluate(
    ({ dataTestId, startX, surfaceTop, viewportHeight }) => {
      const surface = document.querySelector<HTMLElement>(
        `[data-testid="${dataTestId}"]`,
      );
      if (surface === null) {
        return null;
      }

      let fallbackY = Math.min(surfaceTop + 140, viewportHeight - 120);
      let visibleLineY: number | null = null;

      for (
        let y = Math.max(surfaceTop + 40, 0);
        y <= viewportHeight - 120;
        y += 20
      ) {
        const hit = document.elementFromPoint(startX, y);
        if (!(hit instanceof HTMLElement)) {
          continue;
        }
        if (!surface.contains(hit)) {
          continue;
        }

        fallbackY = y;
        if (hit.closest(".cm-line") !== null) {
          visibleLineY = y;
        }
      }

      return {
        startX,
        startY: visibleLineY ?? fallbackY,
      };
    },
    {
      dataTestId: "fileview-prosemark-height-surface",
      startX: bounds.x + bounds.width / 2,
      surfaceTop: bounds.y,
      viewportHeight,
    },
  );
  expect(startPoint).not.toBeNull();
  if (startPoint === null) {
    return;
  }

  const startX = startPoint.startX;
  const startY = startPoint.startY;
  const middleY = startY - 120;
  const endY = startY - 240;
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
        x: startX,
        y: middleY,
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
        x: startX,
        y: endY,
      },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function openFixture(page: Page) {
  await page.goto("/visual-fixture.html?mode=fileview-prosemark-flex-height", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("fileview-prosemark-height-visual-fixture");
  const surface = page.getByTestId("fileview-prosemark-height-surface");
  const scrollContainer = workspaceScrollContainer(surface);

  await expect(fixture).toBeVisible();
  await expect(surface.locator(".cm-content")).toBeVisible();
  await expect
    .poll(async () => {
      const metrics = await readScrollMetrics(scrollContainer);
      return metrics.scrollHeight > metrics.clientHeight;
    })
    .toBe(true);

  return { fixture, scrollContainer, surface };
}

test("ProseMark keeps the real file-view workspace body scrollable on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { fixture, scrollContainer, surface } = await openFixture(page);
  await expect(fixture).toHaveScreenshot("fileview-prosemark-flex-height.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.05,
  });
  const initialMetrics = await readScrollMetrics(scrollContainer);
  await wheelSurface(page, surface);

  await expect
    .poll(async () => {
      return (await readScrollMetrics(scrollContainer)).scrollTop;
    })
    .toBeGreaterThan(initialMetrics.scrollTop + 24);
});

test.describe("mobile prose scroll", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("ProseMark keeps the real file-view workspace body scrollable on mobile", async ({
    page,
  }) => {
    const { scrollContainer, surface } = await openFixture(page);
    const initialMetrics = await readScrollMetrics(scrollContainer);
    await swipeSurface(page, surface);

    await expect
      .poll(async () => {
        return (await readScrollMetrics(scrollContainer)).scrollTop;
      })
      .toBeGreaterThan(initialMetrics.scrollTop + 24);
  });
});
