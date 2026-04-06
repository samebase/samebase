import { expect, test, type Page } from "@playwright/test";
import { dispatchHumanTouchSwipe } from "./touchGestures";

const MOBILE_PANE_TRANSITION_WAIT_MS = 220;
const WORKSPACE_LAYOUT_V2_FIXTURE_URL =
  "/visual-fixture.html?mode=workspace-layout-v2-bare";

async function openWorkspaceLayoutV2Fixture(page: Page): Promise<void> {
  await page.goto(WORKSPACE_LAYOUT_V2_FIXTURE_URL, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("workspace-layout-v2-fixture")).toBeVisible();
  await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);
}

async function swipeFromMainToLeft(page: Page) {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-main"),
    {
      startX: 80,
      startY: 220,
      steps: [
        { delayMs: 25, xOffset: 72, yOffset: 2 },
        { delayMs: 30, xOffset: 168, yOffset: 4 },
        { delayMs: 30, xOffset: 260, yOffset: 5 },
        { delayMs: 25, xOffset: 320, yOffset: 6 },
      ],
    },
  );
}

async function swipeFromMainToRight(page: Page) {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-main"),
    {
      startX: 320,
      startY: 220,
      steps: [
        { delayMs: 25, xOffset: -72, yOffset: 2 },
        { delayMs: 30, xOffset: -168, yOffset: 4 },
        { delayMs: 30, xOffset: -260, yOffset: 5 },
        { delayMs: 25, xOffset: -320, yOffset: 6 },
      ],
    },
  );
}

async function swipeFromRightToMain(page: Page) {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-right"),
    {
      // Start near the live sidebar edge but outside the centered resize grip so
      // mobile edge swipes stay available for pane navigation.
      startX: 12,
      startY: 40,
      steps: [
        { delayMs: 25, xOffset: 72, yOffset: 2 },
        { delayMs: 30, xOffset: 168, yOffset: 4 },
        { delayMs: 30, xOffset: 260, yOffset: 5 },
        { delayMs: 25, xOffset: 320, yOffset: 6 },
      ],
    },
  );
}

async function swipeFromLeftTowardRight(page: Page) {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-left"),
    {
      startX: 312,
      startY: 40,
      steps: [
        { delayMs: 25, xOffset: -72, yOffset: 2 },
        { delayMs: 30, xOffset: -168, yOffset: 4 },
        { delayMs: 30, xOffset: -260, yOffset: 5 },
        { delayMs: 25, xOffset: -320, yOffset: 6 },
      ],
    },
  );
}

async function tapExposedMainStrip(page: Page, side: "left" | "right") {
  const mainPane = page.getByTestId("workspace-layout-v2-pane-main");
  const mainPaneBox = await mainPane.boundingBox();
  const viewportWidth = page.viewportSize()?.width ?? 0;

  expect(mainPaneBox).not.toBeNull();
  if (mainPaneBox === null) {
    return;
  }

  // The main pane still spans the full viewport in track coordinates, so the
  // tap target has to be translated into the main pane's local box.
  const viewportTapX = side === "left" ? viewportWidth - 20 : 20;
  await mainPane.tap({
    position: {
      x: Math.max(
        1,
        Math.min(mainPaneBox.width - 1, viewportTapX - mainPaneBox.x),
      ),
      y: Math.max(1, Math.min(mainPaneBox.height - 1, 220 - mainPaneBox.y)),
    },
  });
}

async function expectResizeHandleToAlignWithPaneBoundary(
  page: Page,
  side: "left" | "right",
) {
  const pane = page.getByTestId(
    side === "left"
      ? "workspace-layout-v2-pane-left"
      : "workspace-layout-v2-pane-right",
  );
  const handle = page.getByTestId(
    side === "left"
      ? "workspace-layout-v2-left-resize"
      : "workspace-layout-v2-right-resize",
  );
  const paneBox = await pane.boundingBox();
  const handleBox = await handle.boundingBox();

  expect(paneBox).not.toBeNull();
  expect(handleBox).not.toBeNull();
  if (paneBox === null || handleBox === null) {
    return;
  }

  const paneBoundaryX = side === "left" ? paneBox.x + paneBox.width : paneBox.x;
  const handleCenterX = handleBox.x + handleBox.width / 2;
  expect(
    Math.abs(Math.round(handleCenterX - paneBoundaryX)),
  ).toBeLessThanOrEqual(1);
}

test("desktop v2 fixture keeps sidebar triggers outside the panes", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width < 768, "desktop-only");

  await openWorkspaceLayoutV2Fixture(page);

  const leftButton = page.getByRole("button", { name: "Toggle Left Sidebar" });
  const rightButton = page.getByRole("button", {
    name: "Toggle Right Sidebar",
  });

  await expect(leftButton).toBeVisible();
  await expect(rightButton).toBeVisible();
  const rightHandle = page.getByTestId("workspace-layout-v2-right-resize");
  const rightWasOpenAtStart = (await rightHandle.count()) > 0;

  if (!rightWasOpenAtStart) {
    await rightButton.click();
    await expect(rightHandle).toBeVisible();
    await rightButton.click();
    await expect(rightHandle).toHaveCount(0);
  } else {
    await expect(rightHandle).toBeVisible();
  }
});

test("mobile v2 fixture requires two swipes to move from left to right", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  const viewportWidth = viewport?.width ?? 0;
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);

  const layout = page.getByTestId("workspace-layout-v2-fixture");
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");
  await expect(
    page.getByRole("button", { name: "Toggle Left Sidebar" }),
  ).toHaveCount(0);

  await swipeFromMainToLeft(page);
  await expect(layout).toHaveAttribute("data-mobile-pane", "left");
  await expect(
    page.getByTestId("workspace-layout-v2-left-resize"),
  ).toBeVisible();
  await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);
  await expectResizeHandleToAlignWithPaneBoundary(page, "left");

  await swipeFromLeftTowardRight(page);
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(
    0,
  );

  await swipeFromMainToRight(page);
  await expect(layout).toHaveAttribute("data-mobile-pane", "right");
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toBeVisible();
  await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);
  await expectResizeHandleToAlignWithPaneBoundary(page, "right");
  const rightPaneBox = await page
    .getByTestId("workspace-layout-v2-pane-right")
    .boundingBox();
  expect(rightPaneBox).not.toBeNull();
  if (rightPaneBox !== null) {
    expect(Math.round(rightPaneBox.x + rightPaneBox.width)).toBe(viewportWidth);
  }

  await swipeFromRightToMain(page);
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toHaveCount(0);
});

test("mobile v2 fixture taps the exposed main strip to return from sidebars", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await openWorkspaceLayoutV2Fixture(page);

  const layout = page.getByTestId("workspace-layout-v2-fixture");
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");

  await swipeFromMainToLeft(page);
  await expect(layout).toHaveAttribute("data-mobile-pane", "left");
  await tapExposedMainStrip(page, "left");
  await expect(layout).toHaveAttribute("data-mobile-pane", "main");
  await page.waitForTimeout(MOBILE_PANE_TRANSITION_WAIT_MS);

  await openWorkspaceLayoutV2Fixture(page);
  const refreshedLayout = page.getByTestId("workspace-layout-v2-fixture");
  await expect(refreshedLayout).toHaveAttribute("data-mobile-pane", "main");

  await swipeFromMainToRight(page);
  await expect(refreshedLayout).toHaveAttribute("data-mobile-pane", "right");
  await tapExposedMainStrip(page, "right");
  await expect(refreshedLayout).toHaveAttribute("data-mobile-pane", "main");
});
