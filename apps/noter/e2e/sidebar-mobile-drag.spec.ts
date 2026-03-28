import { expect, test, type Locator, type Page } from "@playwright/test";

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
