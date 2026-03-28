import { expect, test, type Locator } from "@playwright/test";

async function getClientRect(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      x: rect.x,
    };
  });
}

test("mobile sidebar click translates the workspace without shrinking its width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-chat",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const header = page.getByTestId("dashboard-layout-header");
  const initialHeaderRect = await getClientRect(header);

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeLessThan(4);

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeGreaterThan(120);
  await expect
    .poll(async () =>
      Math.abs((await getClientRect(header)).width - initialHeaderRect.width),
    )
    .toBeLessThan(2);
});

test("mobile sidebar drag opens when the gesture starts from the page body", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(
    "/visual-fixture.html?mode=dashboard-shared-sidebar-mobile-chat",
    {
      waitUntil: "domcontentloaded",
    },
  );
  await page.waitForLoadState("networkidle");

  const header = page.getByTestId("dashboard-layout-header");
  const initialHeaderRect = await getClientRect(header);

  await expect
    .poll(async () => (await getClientRect(header)).x)
    .toBeLessThan(4);

  await page.mouse.move(96, 220);
  await page.mouse.down();
  await page.mouse.move(180, 220, { steps: 8 });

  await expect
    .poll(async () => (await getClientRect(header)).x)
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
    .poll(async () =>
      Math.abs((await getClientRect(header)).width - initialHeaderRect.width),
    )
    .toBeLessThan(2);
});
