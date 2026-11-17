import { expect, type Locator, type Page, test } from "@playwright/test";

test.use({
  launchOptions: {
    args: [
      "--disable-session-crashed-bubble",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
    ],
  },
});

type LogoViewState = {
  elevationDegrees: string | null;
  rotationDegrees: string | null;
};

async function readLogoViewState(scene: Locator): Promise<LogoViewState> {
  return await scene.evaluate((element) => ({
    elevationDegrees: element.getAttribute("data-logo-elevation-degrees"),
    rotationDegrees: element.getAttribute("data-logo-rotation-degrees"),
  }));
}

async function dragLogoScene(
  page: Page,
  scene: Locator,
  dragDelta: { dx: number; dy: number },
): Promise<void> {
  const box = await scene.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dragDelta.dx, y + dragDelta.dy, {
    steps: 10,
  });
  await page.mouse.up();
}

async function loadLogoRoute(page: Page, path: string): Promise<Locator> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  const scene = page.locator("[data-logo-elevation-degrees]").first();
  await expect(scene).toBeVisible();
  return scene;
}

test.describe("logo view snapping parity", () => {
  test("logo canvas leaves vertical mobile drag lanes outside its square", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile",
      "The blank vertical drag lanes are a mobile pane concern.",
    );

    await page.goto("/logo", { waitUntil: "domcontentloaded" });
    const scene = page.locator("[data-logo-elevation-degrees]").first();

    await expect(scene).toBeVisible();
    await expect(scene.locator("canvas")).toBeVisible();

    const sceneBox = await scene.boundingBox();
    const viewportSize = page.viewportSize();
    expect(sceneBox).not.toBeNull();
    expect(viewportSize).not.toBeNull();

    if (sceneBox === null || viewportSize === null) {
      throw new Error("Expected a visible logo scene and viewport.");
    }

    expect(Math.abs(sceneBox.width - sceneBox.height)).toBeLessThanOrEqual(1);
    expect(sceneBox.y).toBeGreaterThan(80);
    expect(viewportSize.height - sceneBox.y - sceneBox.height).toBeGreaterThan(80);
  });

  test("freeView disables the shared snap behavior on the logo route", async ({ page }) => {
    const snappedScene = await loadLogoRoute(page, "/logo");
    await dragLogoScene(page, snappedScene, { dx: 0, dy: 5 });
    const snappedEnd = await readLogoViewState(snappedScene);

    const freeScene = await loadLogoRoute(page, "/logo?freeView");
    await dragLogoScene(page, freeScene, { dx: 0, dy: 5 });
    const freeEnd = await readLogoViewState(freeScene);

    expect(snappedEnd).not.toEqual(freeEnd);
    expect(snappedEnd.elevationDegrees).toBe("35.26438968");
    expect(Number(freeEnd.elevationDegrees)).toBeGreaterThan(36);
    expect(Number(freeEnd.elevationDegrees)).toBeLessThan(38);
  });

  test("default snapped view clears stale route params", async ({ page }) => {
    const logoScene = await loadLogoRoute(page, "/logo?elev=53.3&rot=80");

    await dragLogoScene(page, logoScene, { dx: -100, dy: -100 });

    await expect
      .poll(() => {
        const url = new URL(page.url());
        return {
          pathname: url.pathname,
          searchEntries: Array.from(url.searchParams.entries()),
        };
      })
      .toEqual({
        pathname: "/logo",
        searchEntries: [],
      });

    expect(await readLogoViewState(logoScene)).toEqual({
      elevationDegrees: "35.26438968",
      rotationDegrees: "45",
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(logoScene).toBeVisible();
    expect(await readLogoViewState(logoScene)).toEqual({
      elevationDegrees: "35.26438968",
      rotationDegrees: "45",
    });
  });

  test("default snapping keeps angles outside the one-degree threshold", async ({ page }) => {
    const logoScene = await loadLogoRoute(page, "/logo?elev=22.4&rot=43.6");

    expect(await readLogoViewState(logoScene)).toEqual({
      elevationDegrees: "22.4",
      rotationDegrees: "43.6",
    });
  });

  test("default snapping resolves unsnapped query params", async ({ page }) => {
    const snappedScene = await loadLogoRoute(page, "/logo?elev=359.1");
    expect(await readLogoViewState(snappedScene)).toEqual({
      elevationDegrees: "0",
      rotationDegrees: "45",
    });

    const freeScene = await loadLogoRoute(page, "/logo?freeView&elev=359.1");
    expect(await readLogoViewState(freeScene)).toEqual({
      elevationDegrees: "359.1",
      rotationDegrees: "45",
    });
  });
});
