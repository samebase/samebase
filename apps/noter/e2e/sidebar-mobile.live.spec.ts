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

async function createTouchEventClient(page: Page): Promise<TouchEventClient> {
  return page.context().newCDPSession(page);
}

async function dispatchTouchEvent(
  client: TouchEventClient,
  {
    type,
    x,
    y,
  }: {
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
              id: SIDEBAR_TOUCH_ID,
            },
          ],
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

    await page.keyboard.press("Escape");

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
});
