import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  DRAG_ELEVATION_DEGREES_PER_PIXEL,
  DRAG_ROTATION_DEGREES_PER_PIXEL,
} from "../src/components/logoViewDragConstants";
import { resolveLogoViewState } from "../src/components/logoViewDrag";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "../src/lib/publicLandingLogo";

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

function computeExpectedDraggedView(args: {
  dx: number;
  dy: number;
  startState: LogoViewState;
}): LogoViewState {
  const startElevationDegrees = Number(args.startState.elevationDegrees);
  const startRotationDegrees = Number(args.startState.rotationDegrees);
  const resolvedView = resolveLogoViewState({
    config: PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG,
    view: {
      elevationDegrees:
        startElevationDegrees + args.dy * DRAG_ELEVATION_DEGREES_PER_PIXEL,
      rotationDegrees:
        startRotationDegrees + args.dx * DRAG_ROTATION_DEGREES_PER_PIXEL,
    },
  });

  return {
    elevationDegrees: `${resolvedView.elevationDegrees}`,
    rotationDegrees: `${resolvedView.rotationDegrees}`,
  };
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
    const workspace = page.locator('[data-workspace-layout-v2="mobile"]');
    const carousel = page.getByTestId("workspace-layout-v2-pane-main");
    const scene = page.locator("[data-logo-elevation-degrees]").first();

    await carousel.evaluate((element) => {
      element.scrollLeft = element.scrollWidth - element.clientWidth;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect(workspace).toHaveAttribute("data-mobile-pane", "main");
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
    expect(viewportSize.height - sceneBox.y - sceneBox.height).toBeGreaterThan(
      80,
    );

    await expect(scene).toHaveScreenshot("logo-mobile-square-scene.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.01,
    });
  });

  test("logo route follows the shared landing drag config", async ({
    page,
  }) => {
    const dragCases = [
      { name: "small vertical drag", dx: 0, dy: 10 },
      { name: "larger vertical drag", dx: 0, dy: 20 },
      { name: "small horizontal drag", dx: 10, dy: 0 },
      { name: "larger horizontal drag", dx: 20, dy: 0 },
    ] as const;

    for (const dragCase of dragCases) {
      const logoScene = await loadLogoRoute(page, "/logo");
      const logoStart = await readLogoViewState(logoScene);
      const expectedEnd = computeExpectedDraggedView({
        dx: dragCase.dx,
        dy: dragCase.dy,
        startState: logoStart,
      });
      await dragLogoScene(page, logoScene, dragCase);
      const logoEnd = await readLogoViewState(logoScene);

      expect(logoEnd, `${dragCase.name} should match shared config`).toEqual(
        expectedEnd,
      );
    }
  });

  test("freeView disables the shared snap behavior on the logo route", async ({
    page,
  }) => {
    const snappedScene = await loadLogoRoute(page, "/logo");
    await dragLogoScene(page, snappedScene, { dx: 0, dy: 10 });
    const snappedEnd = await readLogoViewState(snappedScene);

    const freeScene = await loadLogoRoute(page, "/logo?freeView");
    await dragLogoScene(page, freeScene, { dx: 0, dy: 10 });
    const freeEnd = await readLogoViewState(freeScene);

    expect(snappedEnd).not.toEqual(freeEnd);
    expect(snappedEnd.elevationDegrees).toBe("35.26438968");
    expect(Number(freeEnd.elevationDegrees)).toBeGreaterThan(36);
    expect(Number(freeEnd.elevationDegrees)).toBeLessThan(38);
  });

  test("default snapping canonicalizes unsnapped query params", async ({
    page,
  }) => {
    const snappedScene = await loadLogoRoute(page, "/logo?elev=359.1");
    await expect.poll(() => page.url()).not.toContain("elev=359.1");
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
