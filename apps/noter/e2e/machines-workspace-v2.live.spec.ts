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
      startX: 120,
      startY: 220,
      steps: [
        { delayMs: 30, xOffset: 52, yOffset: 2 },
        { delayMs: 35, xOffset: 124, yOffset: 4 },
        { delayMs: 35, xOffset: 212, yOffset: 5 },
      ],
    },
  );
}

async function swipeFromMainToRight(page: Page) {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-main"),
    {
      startX: 220,
      startY: 220,
      steps: [
        { delayMs: 30, xOffset: -52, yOffset: 2 },
        { delayMs: 35, xOffset: -124, yOffset: 4 },
        { delayMs: 35, xOffset: -212, yOffset: 5 },
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
        { delayMs: 30, xOffset: 52, yOffset: 2 },
        { delayMs: 35, xOffset: 124, yOffset: 4 },
        { delayMs: 35, xOffset: 212, yOffset: 5 },
      ],
    },
  );
}

async function swipeFromLeftTowardRight(page: Page) {
  await dispatchHumanTouchSwipe(
    page,
    page.getByTestId("workspace-layout-v2-pane-left"),
    {
      startX: 250,
      startY: 220,
      steps: [
        { delayMs: 30, xOffset: -80, yOffset: 2 },
        { delayMs: 35, xOffset: -176, yOffset: 4 },
        { delayMs: 35, xOffset: -240, yOffset: 5 },
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

async function ensureRightDesktopSidebarClosed(page: Page) {
  const rightHandle = page.getByTestId("workspace-layout-v2-right-resize");
  if ((await rightHandle.count()) === 0) {
    return;
  }

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  await expect(rightHandle).toHaveCount(0);
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
  await ensureRightDesktopSidebarClosed(page);
  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toHaveCount(0);

  await rightButton.click();

  await expect(
    page.getByTestId("workspace-layout-v2-right-resize"),
  ).toBeVisible();
});

test("mobile v2 route requires two swipes to move from left to right", async ({
  page,
}) => {
  const viewport = page.viewportSize();
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
});
