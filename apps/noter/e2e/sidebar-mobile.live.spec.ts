import { expect, type Page, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

const WORKSPACE_FILE_ROUTE = "/vault/noter-md/noter/main/README.md";
const TOUCH_POINT_RADIUS_PX = 1;
const TOUCH_POINT_FORCE = 1;
const SIDEBAR_TOUCH_ID = 1;

type TouchEventClient = {
  send: (
    method: "Input.dispatchTouchEvent",
    params: {
      type: "touchStart" | "touchMove" | "touchEnd";
      touchPoints: Array<{
        force: number;
        id: number;
        radiusX: number;
        radiusY: number;
        x: number;
        y: number;
      }>;
    },
  ) => Promise<unknown>;
};

async function goToWorkspace(page: Page) {
  await page.goto("/?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page);
  await page.goto(WORKSPACE_FILE_ROUTE, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "Toggle Sidebar" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

async function goToDashboard(page: Page) {
  await page.goto("/?dev", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page);
  await page.getByRole("button", { name: "Toggle Sidebar" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

async function getToggleSidebarButtonLeft(page: Page) {
  const box = await page
    .getByRole("button", { name: "Toggle Sidebar" })
    .boundingBox();
  if (!box) {
    throw new Error("Expected toggle sidebar button to have a bounding box.");
  }

  return box.x;
}

function getMobileMainSurface(page: Page) {
  return page.locator('[data-sidebar="mobile-viewport-main"]');
}

async function createTouchEventClient(page: Page): Promise<TouchEventClient> {
  return page.context().newCDPSession(page);
}

async function dispatchTouchEvent(
  client: TouchEventClient,
  {
    id = SIDEBAR_TOUCH_ID,
    type,
    x,
    y,
  }: {
    id?: number;
    type: "touchStart" | "touchMove" | "touchEnd";
    x?: number;
    y?: number;
  },
) {
  await client.send("Input.dispatchTouchEvent", {
    type,
    touchPoints:
      type === "touchEnd" || x === undefined || y === undefined
        ? []
        : [
            {
              x,
              y,
              radiusX: TOUCH_POINT_RADIUS_PX,
              radiusY: TOUCH_POINT_RADIUS_PX,
              force: TOUCH_POINT_FORCE,
              id,
            },
          ],
  });
}

async function dragOpenSidebarWithTouch(
  client: TouchEventClient,
  {
    endX,
    id,
    startX,
    y,
  }: {
    endX: number;
    id: number;
    startX: number;
    y: number;
  },
) {
  await dispatchTouchEvent(client, {
    id,
    type: "touchStart",
    x: startX,
    y,
  });
  await dispatchTouchEvent(client, {
    id,
    type: "touchMove",
    x: endX,
    y,
  });
  await dispatchTouchEvent(client, {
    id,
    type: "touchEnd",
  });
}

test.describe("mobile workspace sidebar live flow", () => {
  test("tap opens and closes the workspace sidebar on mobile", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "This live check targets the mobile Chromium project.",
    );

    await goToWorkspace(page);
    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeLessThan(20);

    await page.getByRole("button", { name: "Toggle Sidebar" }).tap();

    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeGreaterThan(120);

    await getMobileMainSurface(page).tap({
      position: {
        x: 100,
        y: 160,
      },
    });

    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeLessThan(20);
  });

  test("page drag reveals the workspace sidebar before release", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "This live check targets the mobile Chromium project.",
    );

    await goToWorkspace(page);
    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeLessThan(20);

    const touchClient = await createTouchEventClient(page);

    await dispatchTouchEvent(touchClient, {
      type: "touchStart",
      x: 36,
      y: 220,
    });
    await dispatchTouchEvent(touchClient, {
      type: "touchMove",
      x: 180,
      y: 220,
    });

    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeGreaterThan(40);

    await dispatchTouchEvent(touchClient, {
      type: "touchEnd",
    });

    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeGreaterThan(120);
  });

  test("dashboard page drag opens the sidebar from the middle of the page", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "This live check targets the mobile Chromium project.",
    );

    await goToDashboard(page);
    const touchClient = await createTouchEventClient(page);

    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeLessThan(20);

    await dispatchTouchEvent(touchClient, {
      type: "touchStart",
      x: 220,
      y: 220,
    });
    await dispatchTouchEvent(touchClient, {
      type: "touchMove",
      x: 410,
      y: 220,
    });

    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeGreaterThan(40);

    await dispatchTouchEvent(touchClient, {
      type: "touchEnd",
    });

    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeGreaterThan(120);
  });

  test("dragging the visible main pane closes the workspace sidebar", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "This live check targets the mobile Chromium project.",
    );

    await goToWorkspace(page);
    await page.getByRole("button", { name: "Toggle Sidebar" }).tap();

    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeGreaterThan(120);

    const openLeft = await getToggleSidebarButtonLeft(page);
    const touchClient = await createTouchEventClient(page);

    await dispatchTouchEvent(touchClient, {
      type: "touchStart",
      x: 380,
      y: 220,
    });
    await dispatchTouchEvent(touchClient, {
      type: "touchMove",
      x: 48,
      y: 220,
    });

    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeLessThan(openLeft - 120);

    await dispatchTouchEvent(touchClient, {
      type: "touchEnd",
    });

    await expect
      .poll(async () => getToggleSidebarButtonLeft(page))
      .toBeLessThan(20);
  });

  test("dashboard touch drag can reopen the sidebar repeatedly", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "This live check targets the mobile Chromium project.",
    );

    await goToDashboard(page);
    const touchClient = await createTouchEventClient(page);

    for (const cycle of [1, 2, 3, 4, 5]) {
      await expect
        .poll(async () => getToggleSidebarButtonLeft(page))
        .toBeLessThan(20);

      await dragOpenSidebarWithTouch(touchClient, {
        endX: 300,
        id: cycle,
        startX: 140,
        y: 220,
      });

      await expect
        .poll(async () => getToggleSidebarButtonLeft(page))
        .toBeGreaterThan(120);

      await getMobileMainSurface(page).tap({
        position: {
          x: 40,
          y: 160,
        },
      });

      await expect
        .poll(async () => getToggleSidebarButtonLeft(page))
        .toBeLessThan(20);
    }
  });
});
