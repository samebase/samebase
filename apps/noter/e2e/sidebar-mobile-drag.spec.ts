import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function getClientRect(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      right: rect.right,
      width: rect.width,
      x: rect.x,
    };
  });
}

function getSidebarTrigger(page: Page) {
  return page.locator('button[data-sidebar="trigger"]');
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
              force: TOUCH_POINT_FORCE,
              id,
              radiusX: TOUCH_POINT_RADIUS_PX,
              radiusY: TOUCH_POINT_RADIUS_PX,
              x,
              y,
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

async function clickVisibleMainSurfaceToClose(page: Page) {
  await getMobileMainSurface(page).click({
    position: {
      x: 40,
      y: 160,
    },
  });
}

test("mobile sidebar click translates the workspace without shrinking its width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-shell",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const header = page.getByTestId("dashboard-layout-header");
  const sidebarPanel = page.getByTestId("dashboard-shell-sidebar-panel");
  const fixtureRect = await getClientRect(fixture);
  const initialHeaderRect = await getClientRect(header);

  expect(Math.abs(initialHeaderRect.width - fixtureRect.width)).toBeLessThan(2);
  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeLessThan(4);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeLessThan(4);

  await getSidebarTrigger(page).click();

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeGreaterThan(120);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeGreaterThan(120);
  await expect
    .poll(async () =>
      Math.abs((await getClientRect(header)).width - initialHeaderRect.width),
    )
    .toBeLessThan(2);
  await expect
    .poll(async () =>
      Math.abs((await getClientRect(header)).width - fixtureRect.width),
    )
    .toBeLessThan(2);
});

test("mobile shell fixture keeps the translated mobile behavior on desktop-width windows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-shell",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const fixture = page.getByTestId("vault-dashboard-visual-fixture");
  const header = page.getByTestId("dashboard-layout-header");
  const sidebarPanel = page.getByTestId("dashboard-shell-sidebar-panel");
  const fixtureRect = await getClientRect(fixture);
  const initialHeaderRect = await getClientRect(header);
  const initialSidebarRect = await getClientRect(sidebarPanel);

  expect(Math.abs(initialHeaderRect.width - fixtureRect.width)).toBeLessThan(2);
  await getSidebarTrigger(page).click();

  await expect
    .poll(async () => (await getClientRect(header)).x - initialHeaderRect.x)
    .toBeGreaterThan(120);
  await expect
    .poll(async () =>
      Math.abs((await getClientRect(header)).width - initialHeaderRect.width),
    )
    .toBeLessThan(2);
  await expect
    .poll(async () =>
      Math.abs((await getClientRect(header)).width - fixtureRect.width),
    )
    .toBeLessThan(2);
  await expect
    .poll(
      async () =>
        (await getClientRect(sidebarPanel)).right - initialSidebarRect.right,
    )
    .toBeGreaterThan(120);
});

test("mobile sidebar drag opens when the gesture starts from the page body", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-shell",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const header = page.getByTestId("dashboard-layout-header");
  const sidebarPanel = page.getByTestId("dashboard-shell-sidebar-panel");
  const initialHeaderRect = await getClientRect(header);

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeLessThan(4);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeLessThan(4);

  await page.mouse.move(96, 220);
  await page.mouse.down();
  await page.mouse.move(180, 220, { steps: 8 });

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeGreaterThan(40);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeGreaterThan(40);
  await expect
    .poll(async () =>
      Math.abs((await getClientRect(header)).width - initialHeaderRect.width),
    )
    .toBeLessThan(2);

  await page.mouse.up();

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeGreaterThan(120);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeGreaterThan(120);
  await expect
    .poll(async () =>
      Math.abs((await getClientRect(header)).width - initialHeaderRect.width),
    )
    .toBeLessThan(2);
});

test("mobile dashboard drag can open from the middle of the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-shell",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const header = page.getByTestId("dashboard-layout-header");
  const sidebarPanel = page.getByTestId("dashboard-shell-sidebar-panel");
  const initialHeaderRect = await getClientRect(header);

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeLessThan(4);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeLessThan(4);

  await page.mouse.move(220, 220);
  await page.mouse.down();
  await page.mouse.move(410, 220, { steps: 12 });

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeGreaterThan(40);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeGreaterThan(40);
  await expect
    .poll(async () =>
      Math.abs((await getClientRect(header)).width - initialHeaderRect.width),
    )
    .toBeLessThan(2);

  await page.mouse.up();

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeGreaterThan(120);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeGreaterThan(120);
});

test("clicking the visible main pane closes the mobile sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-shell",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const header = page.getByTestId("dashboard-layout-header");
  const sidebarPanel = page.getByTestId("dashboard-shell-sidebar-panel");
  const mainSurface = getMobileMainSurface(page);

  await getSidebarTrigger(page).click();

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeGreaterThan(120);

  await mainSurface.click({
    position: {
      x: 100,
      y: 120,
    },
  });

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeLessThan(20);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeLessThan(20);
});

test("dragging the visible main pane closes the mobile sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-shell",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const header = page.getByTestId("dashboard-layout-header");
  const sidebarPanel = page.getByTestId("dashboard-shell-sidebar-panel");
  const initialHeaderRect = await getClientRect(header);

  await getSidebarTrigger(page).click();

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeGreaterThan(120);
  const openHeaderRect = await getClientRect(header);
  const dragStartX = openHeaderRect.x + 112;
  const dragEndX = 80;

  await page.mouse.move(dragStartX, 220);
  await page.mouse.down();
  await page.mouse.move(dragEndX, 220, { steps: 12 });

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeLessThan(openHeaderRect.x - 120);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeLessThan(openHeaderRect.x);
  await expect
    .poll(async () =>
      Math.abs((await getClientRect(header)).width - initialHeaderRect.width),
    )
    .toBeLessThan(2);

  await page.mouse.up();

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeLessThan(20);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeLessThan(20);
});

test("touch dragging the visible main pane closes the mobile sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-shell",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const header = page.getByTestId("dashboard-layout-header");
  const sidebarPanel = page.getByTestId("dashboard-shell-sidebar-panel");
  const initialHeaderRect = await getClientRect(header);
  const touchClient = await createTouchEventClient(page);

  await getSidebarTrigger(page).click();

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeGreaterThan(120);
  const openHeaderRect = await getClientRect(header);

  await dispatchTouchEvent(touchClient, {
    type: "touchStart",
    x: openHeaderRect.x + 112,
    y: 220,
  });
  await dispatchTouchEvent(touchClient, {
    type: "touchMove",
    x: 48,
    y: 220,
  });

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeLessThan(openHeaderRect.x - 120);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeLessThan(openHeaderRect.x);
  await expect
    .poll(async () =>
      Math.abs((await getClientRect(header)).width - initialHeaderRect.width),
    )
    .toBeLessThan(2);

  await dispatchTouchEvent(touchClient, {
    type: "touchEnd",
  });

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeLessThan(20);
  await expect
    .poll(async () => (await getClientRect(sidebarPanel)).right)
    .toBeLessThan(20);
});

test("touch dragging can reopen the mobile sidebar repeatedly on the same page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-shell",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const header = page.getByTestId("dashboard-layout-header");
  const sidebarPanel = page.getByTestId("dashboard-shell-sidebar-panel");
  const touchClient = await createTouchEventClient(page);

  for (const cycle of [1, 2, 3, 4, 5]) {
    await expect
      .poll(async () => (await getClientRect(header)).x)
      .toBeLessThan(20);
    await expect
      .poll(async () => (await getClientRect(sidebarPanel)).right)
      .toBeLessThan(20);

    await dragOpenSidebarWithTouch(touchClient, {
      endX: 300,
      id: cycle,
      startX: 140,
      y: 220,
    });

    await expect
      .poll(async () => (await getClientRect(header)).x)
      .toBeGreaterThan(120);
    await expect
      .poll(async () => (await getClientRect(sidebarPanel)).right)
      .toBeGreaterThan(120);

    await clickVisibleMainSurfaceToClose(page);

    await expect
      .poll(async () => (await getClientRect(header)).x)
      .toBeLessThan(20);
    await expect
      .poll(async () => (await getClientRect(sidebarPanel)).right)
      .toBeLessThan(20);
  }
});
