import { expect, test, type Page } from "@playwright/test";
import { dispatchHumanTouchSwipe } from "./touchGestures";

async function ensureMachinesWorkspaceV2RouteReady(page: Page): Promise<void> {
  await page.goto("/v2/machines", {
    waitUntil: "domcontentloaded",
  });

  const autofillButton = page.getByRole("button", {
    name: "Autofill & sign in",
  });
  try {
    await autofillButton.waitFor({ state: "visible", timeout: 5_000 });
    await autofillButton.click();
  } catch {
    // The route may already be authenticated and ready to render.
  }

  await expect(page.getByTestId("machines-workspace-v2-route")).toBeVisible();
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
      startX: 120,
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

async function swipeFromLeftTowardRight(page: Page) {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-left"),
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

async function ensureMainMobilePane(page: Page) {
  const route = page.getByTestId("machines-workspace-v2-route");
  const currentPane = await route.getAttribute("data-mobile-pane");

  if (currentPane === "left") {
    await swipeFromLeftTowardRight(page);
    await expect(route).toHaveAttribute("data-mobile-pane", "main");
    return;
  }

  if (currentPane === "right") {
    await swipeFromRightToMain(page);
    await expect(route).toHaveAttribute("data-mobile-pane", "main");
  }
}

test("desktop v2 route keeps sidebar triggers outside the panes", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  test.skip(viewport === null || viewport.width < 768, "desktop-only");

  await ensureMachinesWorkspaceV2RouteReady(page);

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

test("mobile v2 route requires two swipes to move from left to right", async ({
  page,
}) => {
  const viewport = page.viewportSize();
  const viewportWidth = viewport?.width ?? 0;
  test.skip(viewport === null || viewport.width >= 768, "mobile-only repro");

  await ensureMachinesWorkspaceV2RouteReady(page);

  const route = page.getByTestId("machines-workspace-v2-route");
  await ensureMainMobilePane(page);
  await expect(route).toHaveAttribute("data-mobile-pane", "main");
  await expect(
    page.getByRole("button", { name: "Toggle Left Sidebar" }),
  ).toHaveCount(0);

  await swipeFromMainToLeft(page);
  await expect(route).toHaveAttribute("data-mobile-pane", "left");
  await expect(
    page.getByTestId("workspace-layout-v2-left-resize"),
  ).toBeVisible();

  await swipeFromLeftTowardRight(page);
  await expect(route).toHaveAttribute("data-mobile-pane", "main");
  await expect(page.getByTestId("workspace-layout-v2-left-resize")).toHaveCount(
    0,
  );

  await swipeFromMainToRight(page);
  await expect(route).toHaveAttribute("data-mobile-pane", "right");
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toBeVisible();
  const rightPaneBox = await page
    .getByTestId("workspace-layout-v2-pane-right")
    .boundingBox();
  expect(rightPaneBox).not.toBeNull();
  if (rightPaneBox !== null) {
    expect(Math.round(rightPaneBox.x + rightPaneBox.width)).toBe(viewportWidth);
  }

  await swipeFromRightToMain(page);
  await expect(route).toHaveAttribute("data-mobile-pane", "main");
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toHaveCount(0);
});
