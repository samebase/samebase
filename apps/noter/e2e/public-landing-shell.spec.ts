import {
  devices,
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
import { PNG } from "pngjs";
import {
  DRAG_ELEVATION_DEGREES_PER_PIXEL,
  DRAG_ROTATION_DEGREES_PER_PIXEL,
} from "../src/components/logoViewDragConstants";
import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
} from "../src/lib/appBuild";
import {
  LANDING_DEV_MODE_DISABLE_LINK_LABEL,
  LANDING_DEV_MODE_LINK_LABEL,
} from "../src/lib/landingDevMode";
import {
  PUBLIC_LANDING_COPY_TEST_ID,
  PUBLIC_LANDING_SCROLL_SHELL_TEST_ID,
} from "../src/lib/publicLanding";
import {
  PUBLIC_LANDING_LOGO_LINK_REVEAL_ELEVATION_DEGREES,
  PUBLIC_LANDING_LOGO_LINK_REVEAL_ROTATION_DEGREES,
  PUBLIC_LANDING_LOGO_SCENE_TEST_ID,
  PUBLIC_LANDING_LOGO_STAGE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
} from "../src/lib/publicLandingLogo";
import { dispatchHumanTouchSwipe } from "./touchGestures";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

// These budgets target the local production preview used in CI.
// Keep them loose enough to absorb runner variance while still catching
// obvious regressions in the public landing route.
const NAVIGATION_BUDGET_MS = {
  responseEnd: 150,
  domContentLoaded: 400,
  load: 500,
} as const;
const COPY_SHORTCUT_KEY =
  process.platform === "darwin" ? "Meta+C" : "Control+C";
const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0,
  maxDiffPixels: 0,
} as const;

const {
  defaultBrowserType: _mobileLandingDefaultBrowserType,
  ...mobileLandingDevice
} = devices["iPhone 13"];
const iphoneSeLandingDevice = {
  ...mobileLandingDevice,
  viewport: { width: 375, height: 667 },
} as const;

async function readNavigationTiming(page: Parameters<typeof test>[0]["page"]) {
  return page.evaluate(() => {
    const navigationEntry = performance.getEntriesByType("navigation")[0];

    if (!(navigationEntry instanceof PerformanceNavigationTiming)) {
      return null;
    }

    return {
      responseEndMs: navigationEntry.responseEnd,
      domContentLoadedMs: navigationEntry.domContentLoadedEventEnd,
      loadMs: navigationEntry.loadEventEnd,
    };
  });
}

type LandingToggleFrame = {
  href: string;
  top: number | null;
};

type LandingToggleLayout = {
  contentTop: number;
  contentHeight: number;
  authRowHeight: number;
  waitlistLinkTop: number;
  waitlistLinkOffset: number;
};

type LandingReloadFrame = {
  content: {
    top: number;
    height: number;
  } | null;
  copy: {
    top: number;
    height: number;
  } | null;
};

type RgbaPixel = {
  alpha: number;
  blue: number;
  green: number;
  red: number;
};

declare global {
  interface Window {
    __landingReloadFrames?: LandingReloadFrame[];
  }
}

async function captureLandingToggleFrames(
  page: Parameters<typeof test>[0]["page"],
  linkName: string,
): Promise<LandingToggleFrame[]> {
  const framesPromise = page.evaluate(() => {
    return new Promise<LandingToggleFrame[]>((resolve) => {
      const samples: LandingToggleFrame[] = [];
      let frame = 0;

      const capture = () => {
        const root = document.querySelector(
          '[data-testid="public-landing-content"]',
        );
        const rect =
          root instanceof HTMLElement ? root.getBoundingClientRect() : null;
        samples.push({
          href: window.location.href,
          top: rect ? Number(rect.top.toFixed(3)) : null,
        });
        frame += 1;
        if (frame >= 45) {
          resolve(samples);
          return;
        }
        requestAnimationFrame(capture);
      };

      requestAnimationFrame(capture);
    });
  });

  await page.getByRole("link", { name: linkName, exact: true }).click();
  return await framesPromise;
}

async function readLandingToggleLayout(
  page: Parameters<typeof test>[0]["page"],
): Promise<LandingToggleLayout> {
  return await page.evaluate(() => {
    const content = document.querySelector(
      '[data-testid="public-landing-content"]',
    );
    const waitlistLink = document.querySelector(
      'a[href="https://x.com/noter_md"]',
    );
    const googleButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Google") ?? false,
    );

    if (!(content instanceof HTMLElement)) {
      throw new Error("Expected landing content element");
    }
    if (!(waitlistLink instanceof HTMLElement)) {
      throw new Error("Expected landing waitlist link element");
    }
    if (!(googleButton instanceof HTMLElement)) {
      throw new Error("Expected landing Google button element");
    }

    const contentRect = content.getBoundingClientRect();
    const waitlistLinkRect = waitlistLink.getBoundingClientRect();
    const googleRect = googleButton.getBoundingClientRect();

    return {
      contentTop: Number(contentRect.top.toFixed(3)),
      contentHeight: Number(contentRect.height.toFixed(3)),
      authRowHeight: Number(googleRect.height.toFixed(3)),
      waitlistLinkTop: Number(waitlistLinkRect.top.toFixed(3)),
      waitlistLinkOffset: Number(
        (waitlistLinkRect.top - contentRect.top).toFixed(3),
      ),
    };
  });
}

async function readLandingRightSidebarCopyMetrics(page: Page): Promise<{
  carouselWidth: number;
  contentWidth: number;
  mainPaneWidth: number;
  mainPaneClientWidth: number;
  rightPaneClientWidth: number;
  rightPaneWidth: number;
  shellWidth: number;
  teamTextHeight: number;
}> {
  return await page.evaluate(() => {
    const shell = document.querySelector('[data-workspace-layout-v2="mobile"]');
    const carousel = document.querySelector(
      '[data-testid="workspace-layout-v2-pane-main"]',
    );
    const rightPane = document.querySelector(
      '[data-testid="workspace-layout-v2-pane-right"]',
    );
    const mainPane = carousel?.querySelector(".snap-center > div");
    const content = document.querySelector(
      '[data-testid="public-landing-content"]',
    );
    const teamText = Array.from(
      document.querySelectorAll('[data-testid="public-landing-copy"] li span'),
    ).find((node) => node.textContent?.includes("team"));

    if (!(shell instanceof HTMLElement)) {
      throw new Error("Expected mobile landing shell");
    }
    if (!(carousel instanceof HTMLElement)) {
      throw new Error("Expected landing carousel");
    }
    if (!(rightPane instanceof HTMLElement)) {
      throw new Error("Expected landing right pane");
    }
    if (!(mainPane instanceof HTMLElement)) {
      throw new Error("Expected landing main pane");
    }
    if (!(content instanceof HTMLElement)) {
      throw new Error("Expected landing content");
    }
    if (!(teamText instanceof HTMLElement)) {
      throw new Error("Expected landing team bullet text");
    }

    return {
      carouselWidth: Math.round(carousel.getBoundingClientRect().width),
      contentWidth: Math.round(content.getBoundingClientRect().width),
      mainPaneWidth: Math.round(mainPane.getBoundingClientRect().width),
      mainPaneClientWidth: mainPane.clientWidth,
      rightPaneClientWidth: rightPane.clientWidth,
      rightPaneWidth: Math.round(rightPane.getBoundingClientRect().width),
      shellWidth: Math.round(shell.getBoundingClientRect().width),
      teamTextHeight: Math.round(teamText.getBoundingClientRect().height),
    };
  });
}

function readPngPixel(png: PNG, x: number, y: number): RgbaPixel {
  const clampedX = Math.max(0, Math.min(png.width - 1, x));
  const clampedY = Math.max(0, Math.min(png.height - 1, y));
  const index = (clampedY * png.width + clampedX) * 4;

  return {
    red: png.data[index] ?? 0,
    green: png.data[index + 1] ?? 0,
    blue: png.data[index + 2] ?? 0,
    alpha: png.data[index + 3] ?? 0,
  };
}

function getPixelColorDistance(first: RgbaPixel, second: RgbaPixel): number {
  return (
    Math.abs(first.red - second.red) +
    Math.abs(first.green - second.green) +
    Math.abs(first.blue - second.blue)
  );
}

async function readLandingRightSidebarSeparatorPaint(page: Page): Promise<{
  backgroundPixel: RgbaPixel;
  colorDistance: number;
  sampleY: number;
  separatorPixel: RgbaPixel;
  separatorX: number;
}> {
  const geometry = await page.evaluate(() => {
    const shell = document.querySelector('[data-workspace-layout-v2="mobile"]');
    const carousel = document.querySelector(
      '[data-testid="workspace-layout-v2-pane-main"]',
    );
    const mainPane = carousel?.querySelector(".snap-center > div");

    if (!(shell instanceof HTMLElement)) {
      throw new Error("Expected mobile landing shell");
    }
    if (!(mainPane instanceof HTMLElement)) {
      throw new Error("Expected landing main pane");
    }

    const shellRect = shell.getBoundingClientRect();
    const mainPaneRect = mainPane.getBoundingClientRect();
    return {
      backgroundX: Math.round(mainPaneRect.right) - 4,
      sampleY: Math.round(shellRect.top + 48),
      separatorX: Math.round(mainPaneRect.right) - 1,
    };
  });
  const screenshot = await page.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  const png = PNG.sync.read(screenshot);
  const backgroundPixel = readPngPixel(
    png,
    geometry.backgroundX,
    geometry.sampleY,
  );
  const separatorPixel = readPngPixel(
    png,
    geometry.separatorX,
    geometry.sampleY,
  );

  return {
    backgroundPixel,
    colorDistance: getPixelColorDistance(separatorPixel, backgroundPixel),
    sampleY: geometry.sampleY,
    separatorPixel,
    separatorX: geometry.separatorX,
  };
}

async function captureLandingReloadFrames(
  page: Parameters<typeof test>[0]["page"],
  path?: string,
): Promise<LandingReloadFrame[]> {
  await page.addInitScript(() => {
    const sampleCount = 60;
    const frameStore: LandingReloadFrame[] = [];
    window.__landingReloadFrames = frameStore;

    const readRect = (node: Element | null) => {
      if (!(node instanceof HTMLElement)) {
        return null;
      }

      const rect = node.getBoundingClientRect();
      return {
        top: Number(rect.top.toFixed(3)),
        height: Number(rect.height.toFixed(3)),
      };
    };

    let frame = 0;
    const capture = () => {
      frameStore.push({
        content: readRect(
          document.querySelector('[data-testid="public-landing-content"]'),
        ),
        copy: readRect(
          document.querySelector('[data-testid="public-landing-copy"]'),
        ),
      });
      frame += 1;
      if (frame >= sampleCount) {
        return;
      }
      requestAnimationFrame(capture);
    };

    requestAnimationFrame(capture);
  });

  if (path !== undefined) {
    await page.goto(path, { waitUntil: "networkidle" });
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  return await page.evaluate(() => {
    const landingReloadFrames = window.__landingReloadFrames;

    return Array.isArray(landingReloadFrames) ? landingReloadFrames : [];
  });
}

function expectStableLandingReloadFrames(frames: LandingReloadFrame[]) {
  const visibleFrames = frames.flatMap((frame) => {
    if (frame.content === null || frame.copy === null) {
      return [];
    }
    return [frame];
  });

  expect(visibleFrames.length).toBeGreaterThanOrEqual(10);

  const contentTopValues = visibleFrames.map((frame) => frame.content!.top);
  const copyTopValues = visibleFrames.map((frame) => frame.copy!.top);
  const copyHeightValues = visibleFrames.map((frame) => frame.copy!.height);

  expect(
    Math.max(...contentTopValues) - Math.min(...contentTopValues),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...copyTopValues) - Math.min(...copyTopValues),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.max(...copyHeightValues) - Math.min(...copyHeightValues),
  ).toBeLessThanOrEqual(1);
}

/**
 * The target route should stop shifting once at least 10 target-path frames
 * have been captured.
 */
function expectStableLandingToggleFrames(
  frames: LandingToggleFrame[],
  expectedPathWithSearch: "/?dev" | "/",
) {
  const sawExpectedPath = frames.some((frame) => {
    const url = new URL(frame.href);
    return `${url.pathname}${url.search}` === expectedPathWithSearch;
  });
  expect(sawExpectedPath).toBe(true);
  expect(frames.some((frame) => frame.top === null)).toBe(false);

  const expectedPathTopValues = frames.flatMap((frame) => {
    const url = new URL(frame.href);
    return `${url.pathname}${url.search}` === expectedPathWithSearch &&
      frame.top !== null
      ? [frame.top]
      : [];
  });
  expect(expectedPathTopValues.length).toBeGreaterThanOrEqual(10);
  expect(
    Math.max(...expectedPathTopValues) - Math.min(...expectedPathTopValues),
  ).toBeLessThanOrEqual(1);
}

async function expectLandingToggleFocusTarget(
  page: Parameters<typeof test>[0]["page"],
) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const activeElement = document.activeElement;
        return activeElement === document.body
          ? "body"
          : activeElement instanceof HTMLElement &&
              activeElement.id === "public-landing-dev-toggle"
            ? "public-landing-dev-toggle"
            : (activeElement?.tagName.toLowerCase() ?? null);
      }),
    )
    .toMatch(/^(body|public-landing-dev-toggle)$/);
}

async function expectLandingLogoReady(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(async () =>
      image.evaluate(
        (element) =>
          element instanceof HTMLImageElement &&
          element.complete &&
          element.naturalWidth > 0,
      ),
    )
    .toBe(true);
}

async function expectLandingLogoSceneReady(scene: Locator) {
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute("data-state", "ready");
}

async function expectAppBuildVersion(versionLabel: Locator) {
  await expect(versionLabel).toHaveText(/^v\d+$/);
}

async function expectAppBuildVersionDisplay(
  statusBar: Locator,
  versionLabel: Locator,
  commitLabel: Locator,
) {
  await expectAppBuildVersion(versionLabel);
  await expect(commitLabel).toHaveText(/^[0-9a-f]{8}$/);
  const buildVersionGroup = statusBar.locator(".font-mono").first();
  const versionText = await versionLabel.textContent();
  const commitText = await commitLabel.textContent();
  expect(versionText).not.toBeNull();
  expect(commitText).not.toBeNull();
  await expect
    .poll(async () => {
      const buildVersionText = await buildVersionGroup.textContent();
      return buildVersionText?.replace(/\s+/g, "") ?? null;
    })
    .toBe(`${versionText ?? ""}${commitText ?? ""}`);
}

async function expectAppBuildCommitLink(commitLabel: Locator) {
  const href = await commitLabel.getAttribute("href");

  expect(href).toMatch(
    /^https:\/\/github\.com\/noter-md\/noter\/commit\/[0-9a-f]{40}$/,
  );

  return href;
}

async function expectLegalLinksUseRightSidebarInnerEdge(statusBar: Locator) {
  const termsLink = statusBar.getByRole("link", { name: "/terms" });
  const privacyLink = statusBar.getByRole("link", { name: "/privacy" });
  const versionLabel = statusBar.getByTestId(APP_BUILD_VERSION_TEST_ID);

  await expect(termsLink).toBeVisible();
  await expect(privacyLink).toBeVisible();
  await expect(versionLabel).toBeVisible();

  const termsBox = await termsLink.boundingBox();
  const privacyBox = await privacyLink.boundingBox();
  const versionBox = await versionLabel.boundingBox();
  const statusBarBox = await statusBar.boundingBox();
  expect(termsBox).not.toBeNull();
  expect(privacyBox).not.toBeNull();
  expect(versionBox).not.toBeNull();
  expect(statusBarBox).not.toBeNull();
  if (
    termsBox === null ||
    privacyBox === null ||
    versionBox === null ||
    statusBarBox === null
  ) {
    return;
  }

  const leftPaddingPx = await statusBar.evaluate((element) => {
    const value = Number.parseFloat(getComputedStyle(element).paddingLeft);
    return Number.isFinite(value) ? value : 0;
  });
  const expectedLeftEdge = statusBarBox.x + leftPaddingPx;
  for (const childBox of [termsBox, privacyBox, versionBox]) {
    expect(Math.abs(childBox.x - expectedLeftEdge)).toBeLessThanOrEqual(1);
  }
}

async function expectStatusBarInRightSidebar(
  page: Parameters<typeof test>[0]["page"],
  statusBar: Locator,
) {
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");
  const rightPaneBox = await rightPane.boundingBox();
  const statusBarBox = await statusBar.boundingBox();

  expect(rightPaneBox).not.toBeNull();
  expect(statusBarBox).not.toBeNull();
  if (rightPaneBox === null || statusBarBox === null) {
    return;
  }

  const epsilonPx = 1;
  expect(statusBarBox.x).toBeGreaterThanOrEqual(rightPaneBox.x - epsilonPx);
  expect(statusBarBox.y).toBeGreaterThanOrEqual(rightPaneBox.y - epsilonPx);
  expect(statusBarBox.x + statusBarBox.width).toBeLessThanOrEqual(
    rightPaneBox.x + rightPaneBox.width + epsilonPx,
  );
  expect(statusBarBox.y + statusBarBox.height).toBeLessThanOrEqual(
    rightPaneBox.y + rightPaneBox.height + epsilonPx,
  );
}

async function selectText(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) {
    throw new Error("Expected selectable text bounds");
  }

  await locator.hover({ force: true });
  await locator.page().mouse.move(box.x + 1, box.y + box.height / 2);
  await locator.page().mouse.down();
  await locator
    .page()
    .mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 20 });
  await locator.page().mouse.up();
}

async function readClipboardText(page: Parameters<typeof test>[0]["page"]) {
  return page.evaluate(async () => navigator.clipboard.readText());
}

async function readLinkPresentation(link: Locator) {
  return link.evaluate((element) => {
    const linkStyle = window.getComputedStyle(element);
    const parent = element.parentElement;

    return {
      color: linkStyle.color,
      parentColor:
        parent === null ? null : window.getComputedStyle(parent).color,
      textDecorationLine: linkStyle.textDecorationLine,
    };
  });
}

async function expectLandingLogoAutoRotates(scene: Locator) {
  await expectLandingLogoSceneReady(scene);
  const initialRotationDegrees = await scene.getAttribute(
    "data-rotation-degrees",
  );
  expect(initialRotationDegrees).not.toBeNull();
  if (initialRotationDegrees === null) {
    return;
  }

  await expect
    .poll(async () => {
      const currentRotationDegrees = await scene.getAttribute(
        "data-rotation-degrees",
      );
      return currentRotationDegrees ?? initialRotationDegrees;
    })
    .not.toBe(initialRotationDegrees);
}

async function readLandingLogoSceneView(scene: Locator) {
  const elevationDegrees = await scene.getAttribute("data-elevation-degrees");
  const rotationDegrees = await scene.getAttribute("data-rotation-degrees");

  return {
    elevationDegrees,
    rotationDegrees,
  };
}

async function dragLandingLogoSceneToView(
  scene: Locator,
  targetView: {
    elevationDegrees: number;
    rotationDegrees: number;
  },
) {
  const canvas = scene.locator("canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    throw new Error("Expected landing logo canvas bounds");
  }

  const currentView = await readLandingLogoSceneView(scene);
  const currentElevationDegrees = Number.parseFloat(
    currentView.elevationDegrees ?? "NaN",
  );
  const currentRotationDegrees = Number.parseFloat(
    currentView.rotationDegrees ?? "NaN",
  );
  expect(Number.isNaN(currentElevationDegrees)).toBe(false);
  expect(Number.isNaN(currentRotationDegrees)).toBe(false);
  if (
    Number.isNaN(currentElevationDegrees) ||
    Number.isNaN(currentRotationDegrees)
  ) {
    throw new Error("Expected current landing logo view attributes");
  }

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const deltaX =
    (targetView.rotationDegrees - currentRotationDegrees) /
    DRAG_ROTATION_DEGREES_PER_PIXEL;
  const deltaY =
    (targetView.elevationDegrees - currentElevationDegrees) /
    DRAG_ELEVATION_DEGREES_PER_PIXEL;

  await scene.page().mouse.move(centerX, centerY);
  await scene.page().mouse.down();
  await scene.page().mouse.move(centerX + deltaX, centerY + deltaY, {
    steps: 12,
  });
  await scene.page().mouse.up();
}

test("public landing renders the routed landing UI directly", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByTestId("public-landing-content")).toBeVisible();
  await expect(
    page.getByTestId(PUBLIC_LANDING_SCROLL_SHELL_TEST_ID),
  ).toBeVisible();
  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toHaveAttribute("href", "https://x.com/noter_md");
});

test("landing dev mode shows Google sign-in", async ({ page }) => {
  await page.goto("/?dev", { waitUntil: "networkidle" });

  const googleButton = page.getByRole("button", { name: "Google" });

  await expect(googleButton).toBeVisible();
  await expect(googleButton).toHaveScreenshot(
    "public-landing-google-button.png",
    strictScreenshotOptions,
  );
});

test("public landing interactive elements use pointer cursors", async ({
  page,
}) => {
  await page.goto("/?dev", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Google" })).toHaveCSS(
    "cursor",
    "pointer",
  );
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toHaveCSS("cursor", "pointer");
});

test("public landing renders the closed Google signup return state", async ({
  page,
}) => {
  await page.goto("/?signup=google", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");

  await expect(landingContent).toBeVisible();
  await expect(landingContent.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(
    landingContent.getByRole("link", { name: "go back" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toHaveCount(0);

  await expect(landingContent).toHaveScreenshot(
    "public-landing-google-signup-closed.png",
    strictScreenshotOptions,
  );
});

test("landing dev toggle keeps the waitlist row aligned", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const beforeToggleLayout = await readLandingToggleLayout(page);

  await page
    .getByRole("link", { name: LANDING_DEV_MODE_LINK_LABEL, exact: true })
    .click();
  await expect(page).toHaveURL(/\/\?dev$/);
  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();

  const afterToggleLayout = await readLandingToggleLayout(page);

  expect(
    Math.abs(
      afterToggleLayout.authRowHeight - beforeToggleLayout.authRowHeight,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(
      afterToggleLayout.waitlistLinkOffset -
        beforeToggleLayout.waitlistLinkOffset,
    ),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(
      afterToggleLayout.contentHeight - beforeToggleLayout.contentHeight,
    ),
  ).toBeLessThanOrEqual(1);
});

test("public landing omits section divider lines", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");
  await expect(landingContent.locator(".border-t")).toHaveCount(0);
});

test("public landing stays vertically stable while the page reloads", async ({
  page,
}) => {
  // `/?prod-ui` mirrors the shipped production shell while suppressing the
  // worktree-only password auth surface that would otherwise add a separate
  // preview-only layout shift on local routes.
  const reloadFrames = await captureLandingReloadFrames(page, "/?prod-ui");

  expectStableLandingReloadFrames(reloadFrames);
});

test("local landing keeps the remembered password auth slot stable on reload", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("button", { name: "Autofill & sign in" }),
  ).toBeVisible();

  const reloadFrames = await captureLandingReloadFrames(page);

  expectStableLandingReloadFrames(reloadFrames);
});

test("public landing keeps legal links in the sidebar rail", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");
  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(
    0,
  );
  await expectLegalLinksUseRightSidebarInnerEdge(statusBar);
  await expectStatusBarInRightSidebar(page, statusBar);
  await expect(
    landingContent.getByRole("link", { name: "/terms" }),
  ).toHaveCount(0);
  await expect(
    landingContent.getByRole("link", { name: "/privacy" }),
  ).toHaveCount(0);

  const statusBarScreenshot = await takeStableScreenshot(statusBar);
  await testInfo.attach("public-landing-status-bar", {
    body: statusBarScreenshot,
    contentType: "image/png",
  });
});

test("public landing omits the sidebar header button on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "networkidle" });

  const workspace = page.locator('[data-workspace-layout-v2="desktop"]');
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");

  await expect(workspace).toBeVisible();
  await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Toggle sidebar" }),
  ).toHaveCount(0);
  await expect
    .poll(async () =>
      rightPane.evaluate((element) =>
        Math.round(element.getBoundingClientRect().width),
      ),
    )
    .toBe(288);
});

test("mcp consent sign-in keeps legal links in the sidebar rail", async ({
  page,
}) => {
  await page.goto(
    "/oauth/mcp/consent?mcp_consent_request=mcpar_test&mcp_login_required=1",
    { waitUntil: "networkidle" },
  );

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expectLegalLinksUseRightSidebarInnerEdge(statusBar);
  await expectStatusBarInRightSidebar(page, statusBar);
  await expect(statusBar.getByRole("link", { name: "/home" })).toBeVisible();
  await expect(page.getByText("Temporary MCP sign-in note")).toBeVisible();
});

test("build version stays stable on the public landing", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const version = statusBar.getByTestId(APP_BUILD_VERSION_TEST_ID);
  const commit = statusBar.getByTestId(APP_BUILD_COMMIT_LINK_TEST_ID);

  await expectAppBuildVersionDisplay(statusBar, version, commit);
  await expectAppBuildCommitLink(commit);
});

test("build version copies as a Markdown link on the public landing", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/", { waitUntil: "networkidle" });

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const version = page.getByTestId(APP_BUILD_VERSION_TEST_ID);
  const commit = page.getByTestId(APP_BUILD_COMMIT_LINK_TEST_ID);
  await expectAppBuildVersionDisplay(statusBar, version, commit);
  const commitText = await commit.textContent();
  const versionHref = await expectAppBuildCommitLink(commit);
  expect(commitText).not.toBeNull();
  await selectText(commit);
  await page.keyboard.press(COPY_SHORTCUT_KEY);
  const clipboardText = await readClipboardText(page);
  expect(clipboardText).toBe(`[${commitText}](${versionHref})`);
});

test("landing footer links keep browser link styling", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const termsLink = page.getByRole("link", {
    name: "/terms",
    exact: true,
  });
  const footer = termsLink.locator("xpath=..");

  await expect(termsLink).toBeVisible();

  const linkPresentation = await readLinkPresentation(termsLink);
  expect(linkPresentation.textDecorationLine).toContain("underline");

  const footerScreenshot = await takeStableScreenshot(footer);

  await testInfo.attach("public-landing-footer-links", {
    body: footerScreenshot,
    contentType: "image/png",
  });
});

test.describe("mobile landing dev toggle", () => {
  test.use(mobileLandingDevice);

  test("landing omits the sidebar header button on mobile", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const mobileShell = page.locator('[data-workspace-layout-v2="mobile"]');
    await expect(mobileShell).toHaveAttribute("data-mobile-pane", "main");
    await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Toggle sidebar" }),
    ).toHaveCount(0);
  });

  test("landing uses document scroll on mobile instead of an inner scroll shell", async ({
    page,
  }) => {
    await page.goto("/?prod-ui", { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 390, height: 320 });

    const scrollOwnership = await page.evaluate(() => {
      const shell = document.querySelector(
        '[data-testid="public-landing-scroll-shell"]',
      );
      const scrollingElement = document.scrollingElement;

      if (!(shell instanceof HTMLElement)) {
        throw new Error("Expected landing shell");
      }
      if (!(scrollingElement instanceof HTMLElement)) {
        throw new Error("Expected document scrolling element");
      }

      const shellStyle = getComputedStyle(shell);
      return {
        documentCanScroll:
          scrollingElement.scrollHeight > scrollingElement.clientHeight,
        shellCanScroll: shell.scrollHeight > shell.clientHeight,
        shellOverflowY: shellStyle.overflowY,
      };
    });

    expect(scrollOwnership.documentCanScroll).toBe(true);
    expect(scrollOwnership.shellCanScroll).toBe(false);
    expect(scrollOwnership.shellOverflowY).not.toBe("auto");

    const scrollTop = await page.evaluate(() => {
      const shell = document.querySelector(
        '[data-testid="public-landing-scroll-shell"]',
      );
      const scrollingElement = document.scrollingElement;

      if (!(shell instanceof HTMLElement)) {
        throw new Error("Expected landing shell");
      }
      if (!(scrollingElement instanceof HTMLElement)) {
        throw new Error("Expected document scrolling element");
      }

      window.scrollTo(0, 160);
      return {
        documentScrollTop: scrollingElement.scrollTop,
        shellScrollTop: shell.scrollTop,
      };
    });

    expect(scrollTop.documentScrollTop).toBeGreaterThan(0);
    expect(scrollTop.shellScrollTop).toBe(0);
  });

  test("landing keeps the right mobile sidebar resizable", async ({ page }) => {
    await page.goto("/?dev", { waitUntil: "networkidle" });

    const paneGeometry = await page.evaluate(() => {
      const shell = document.querySelector(
        '[data-workspace-layout-v2="mobile"]',
      );
      const mainPane = document.querySelector(
        '[data-testid="workspace-layout-v2-pane-main"]',
      );
      const leftPane = document.querySelector(
        '[data-testid="workspace-layout-v2-pane-left"]',
      );
      const rightPane = document.querySelector(
        '[data-testid="workspace-layout-v2-pane-right"]',
      );

      if (!(shell instanceof HTMLElement)) {
        throw new Error("Expected mobile workspace shell");
      }
      if (!(mainPane instanceof HTMLElement)) {
        throw new Error("Expected main pane");
      }

      return {
        leftPaneCount: leftPane === null ? 0 : 1,
        mainRightPx: mainPane.getBoundingClientRect().right,
        rightPaneCount: rightPane === null ? 0 : 1,
        shellRightPx: shell.getBoundingClientRect().right,
      };
    });

    expect(Math.round(paneGeometry.mainRightPx)).toBe(
      Math.round(paneGeometry.shellRightPx),
    );
    expect(paneGeometry.leftPaneCount).toBe(0);
    expect(paneGeometry.rightPaneCount).toBe(1);

    const mobileShell = page.locator('[data-workspace-layout-v2="mobile"]');
    await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("workspace-layout-v2-left-resize"),
    ).toHaveCount(0);

    await page
      .getByTestId("workspace-layout-v2-pane-main")
      .evaluate((element) => {
        element.scrollLeft = 0;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

    await expect(mobileShell).toHaveAttribute("data-mobile-pane", "main");

    await page
      .getByTestId("workspace-layout-v2-pane-main")
      .evaluate((element) => {
        const rightPane = document.querySelector(
          '[data-testid="workspace-layout-v2-pane-right"]',
        );
        if (!(rightPane instanceof HTMLElement)) {
          throw new Error("Expected landing right pane");
        }

        element.style.scrollSnapType = "none";
        element.scrollLeft +=
          rightPane.getBoundingClientRect().right -
          element.getBoundingClientRect().right;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

    await expect(
      page.locator('[data-workspace-layout-v2="mobile"]'),
    ).toHaveAttribute("data-mobile-pane", "right");
    await expect(
      page.getByTestId("workspace-layout-v2-right-resize"),
    ).toHaveCount(1);

    const mobileShellBox = await mobileShell.boundingBox();
    expect(mobileShellBox).not.toBeNull();
    if (mobileShellBox === null) {
      throw new Error("Expected landing mobile shell box");
    }

    const handleBox = await page
      .getByTestId("workspace-layout-v2-right-resize")
      .boundingBox();
    expect(handleBox).not.toBeNull();
    if (handleBox === null) {
      throw new Error("Expected landing right resize handle box");
    }

    const handleValues = await page
      .getByTestId("workspace-layout-v2-right-resize")
      .evaluate((element) => {
        const currentWidthPx = Number.parseFloat(
          element.getAttribute("aria-valuenow") ?? "NaN",
        );
        const minWidthPx = Number.parseFloat(
          element.getAttribute("aria-valuemin") ?? "NaN",
        );

        if (!Number.isFinite(currentWidthPx) || !Number.isFinite(minWidthPx)) {
          throw new Error("Expected numeric right resize handle values");
        }

        return { currentWidthPx, minWidthPx };
      });
    // Drag past the min-clamp threshold so resizing hands off into a main-pane slide.
    const dragDistancePx =
      handleValues.currentWidthPx - handleValues.minWidthPx + 40;
    const dragSteps = 4;
    const dragFrameMs = 16;
    await dispatchHumanTouchSwipe(page, mobileShell, {
      startX: handleBox.x - mobileShellBox.x + handleBox.width / 2,
      startY: handleBox.y - mobileShellBox.y + handleBox.height / 2,
      steps: Array.from({ length: dragSteps }, (_, index) => {
        const step = index + 1;

        return {
          delayMs: dragFrameMs,
          xOffset: (dragDistancePx * step) / dragSteps,
          yOffset: 0,
        };
      }),
    });

    await expect(
      page.locator('[data-workspace-layout-v2="mobile"]'),
    ).toHaveAttribute("data-mobile-pane", "main");
    await expect(
      page.getByTestId("workspace-layout-v2-right-resize"),
    ).toHaveCount(0);
  });

  test("landing dev toggle keeps the landing card stable frame by frame", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const forwardFrames = await captureLandingToggleFrames(
      page,
      LANDING_DEV_MODE_LINK_LABEL,
    );
    expectStableLandingToggleFrames(forwardFrames, "/?dev");
    await expectLandingToggleFocusTarget(page);
    await expectLandingLogoAutoRotates(
      page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID),
    );

    const backFrames = await captureLandingToggleFrames(
      page,
      LANDING_DEV_MODE_DISABLE_LINK_LABEL,
    );
    expectStableLandingToggleFrames(backFrames, "/");
    await expectLandingToggleFocusTarget(page);
  });
});

test.describe("iPhone SE landing sidebar", () => {
  test.use(iphoneSeLandingDevice);

  test("keeps mobile pane dimensions exact while sliding to the right sidebar", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(
      0,
    );

    const beforeSlideMetrics = await readLandingRightSidebarCopyMetrics(page);

    await page
      .getByTestId("workspace-layout-v2-pane-main")
      .evaluate((element) => {
        // The regression happened when pane ownership changed mid-gesture.
        const rightPane = document.querySelector(
          '[data-testid="workspace-layout-v2-pane-right"]',
        );
        if (!(rightPane instanceof HTMLElement)) {
          throw new Error("Expected landing right pane");
        }

        element.style.scrollSnapType = "none";
        element.scrollLeft +=
          rightPane.getBoundingClientRect().right -
          element.getBoundingClientRect().right;
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });

    await expect(
      page.locator('[data-workspace-layout-v2="mobile"]'),
    ).toHaveAttribute("data-mobile-pane", "right");

    const afterSlideMetrics = await readLandingRightSidebarCopyMetrics(page);

    // This invariant intentionally has no pixel tolerance: a 1px pane or
    // content-box change can rewrap text and means the shell geometry shifted.
    expect(afterSlideMetrics.shellWidth).toBe(beforeSlideMetrics.shellWidth);
    expect(afterSlideMetrics.carouselWidth).toBe(
      beforeSlideMetrics.carouselWidth,
    );
    expect(afterSlideMetrics.rightPaneWidth).toBe(
      beforeSlideMetrics.rightPaneWidth,
    );
    expect(afterSlideMetrics.rightPaneClientWidth).toBe(
      beforeSlideMetrics.rightPaneClientWidth,
    );
    expect(afterSlideMetrics.mainPaneWidth).toBe(
      beforeSlideMetrics.mainPaneWidth,
    );
    expect(afterSlideMetrics.mainPaneClientWidth).toBe(
      beforeSlideMetrics.mainPaneClientWidth,
    );
    expect(afterSlideMetrics.contentWidth).toBe(
      beforeSlideMetrics.contentWidth,
    );
    expect(afterSlideMetrics.teamTextHeight).toBe(
      beforeSlideMetrics.teamTextHeight,
    );

    const separatorPaint = await readLandingRightSidebarSeparatorPaint(page);
    expect(separatorPaint.separatorPixel.alpha).toBe(255);
    expect(separatorPaint.colorDistance).toBeGreaterThan(10);
  });
});

test("landing dev toggle ignores duplicate taps", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await page.evaluate(() => {
    const toggleLink = document.getElementById("public-landing-dev-toggle");
    if (!(toggleLink instanceof HTMLAnchorElement)) {
      return;
    }

    toggleLink.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
      }),
    );
    toggleLink.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        button: 0,
      }),
    );
  });

  await expect(page).toHaveURL(/\/\?dev$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test("waitlist link stays visible through the dev toggle", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const waitlistLink = page.getByRole("link", {
    name: "https://x.com/noter_md",
    exact: true,
  });
  await expect(waitlistLink).toBeVisible();
  await expect(waitlistLink).toHaveAttribute("href", "https://x.com/noter_md");
  await page
    .getByRole("link", { name: LANDING_DEV_MODE_LINK_LABEL, exact: true })
    .click();
  await expect(page).toHaveURL(/\/\?dev$/);
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toHaveAttribute("href", "https://x.com/noter_md");
});

test("public landing keeps the card height stable while toggling dev mode", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");
  await expect(landingContent).toBeVisible();
  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));

  const plainLandingHeight = await landingContent.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height),
  );

  await page
    .getByRole("link", { name: LANDING_DEV_MODE_LINK_LABEL, exact: true })
    .click();
  await expect(page).toHaveURL(/\/\?dev$/);

  const devLandingHeight = await landingContent.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height),
  );

  expect(Math.abs(devLandingHeight - plainLandingHeight)).toBeLessThanOrEqual(
    8,
  );
});

test("prod-ui landing logo enhancement stays visually aligned", async ({
  page,
}, testInfo) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const landingLogo = page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID);
  const landingLogoStage = page.getByTestId(PUBLIC_LANDING_LOGO_STAGE_TEST_ID);
  await expectLandingLogoReady(landingLogo);

  const initialLogoScreenshot = await takeStableScreenshot(landingLogoStage);

  await expectLandingLogoSceneReady(
    page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID),
  );

  const enhancedLogoScreenshot = await takeStableScreenshot(landingLogoStage);

  await expectScreenshotsToMatch({
    actual: enhancedLogoScreenshot,
    artifactPrefix: "public-landing-logo-enhancement",
    expected: initialLogoScreenshot,
    maxDiffPixelRatio: 0.015,
    testInfo,
  });
});

test("prod-ui landing logo becomes draggable after the SVG fallback is removed", async ({
  page,
}) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const landingLogo = page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID);
  const landingLogoScene = page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID);
  const landingLogoCanvas = landingLogoScene.locator("canvas");

  await expectLandingLogoReady(landingLogo);
  await expectLandingLogoSceneReady(landingLogoScene);
  await expect(landingLogo).toHaveClass(/pointer-events-none opacity-0/);
  await expect(landingLogoScene).toHaveClass(/pointer-events-auto touch-none/);

  await expect
    .poll(async () =>
      landingLogoScene.evaluate((element) => {
        const sceneRoot = element.firstElementChild;
        if (!(sceneRoot instanceof HTMLElement)) {
          return null;
        }

        return window.getComputedStyle(sceneRoot).cursor;
      }),
    )
    .toBe("grab");

  const viewBeforeDrag = await readLandingLogoSceneView(landingLogoScene);
  expect(viewBeforeDrag).toEqual({
    elevationDegrees: "35.264",
    rotationDegrees: "45.000",
  });

  const canvasBounds = await landingLogoCanvas.boundingBox();
  expect(canvasBounds).not.toBeNull();
  if (!canvasBounds) {
    return;
  }

  await page.mouse.move(
    canvasBounds.x + canvasBounds.width / 2,
    canvasBounds.y + canvasBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width / 2 + 48,
    canvasBounds.y + canvasBounds.height / 2 + 16,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect
    .poll(async () => readLandingLogoSceneView(landingLogoScene))
    .not.toEqual(viewBeforeDrag);
});

test("prod-ui landing reveals /logo only for the darker straight-on logo face", async ({
  page,
}) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const landingLogo = page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID);
  const landingLogoScene = page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID);

  await expectLandingLogoReady(landingLogo);
  await expectLandingLogoSceneReady(landingLogoScene);

  const hiddenLogoLink = statusBar.locator('a[href="/logo"]');
  const homeLink = statusBar.getByRole("link", {
    name: "/home",
    exact: true,
  });
  const termsLink = statusBar.getByRole("link", {
    name: "/terms",
    exact: true,
  });

  await expect(hiddenLogoLink).toHaveAttribute("aria-hidden", "true");
  await expect(hiddenLogoLink).toHaveClass(/text-background/);
  await expect(
    statusBar.getByRole("link", { name: "/logo", exact: true }),
  ).toHaveCount(0);
  await expect(homeLink).toBeVisible();
  await expect(termsLink).toBeVisible();

  const hiddenLogoBox = await hiddenLogoLink.boundingBox();
  const homeBoxBefore = await homeLink.boundingBox();
  const termsBoxBefore = await termsLink.boundingBox();
  expect(hiddenLogoBox).not.toBeNull();
  expect(homeBoxBefore).not.toBeNull();
  expect(termsBoxBefore).not.toBeNull();
  if (
    hiddenLogoBox === null ||
    homeBoxBefore === null ||
    termsBoxBefore === null
  ) {
    return;
  }

  expect(hiddenLogoBox.y).toBeLessThan(homeBoxBefore.y);

  await dragLandingLogoSceneToView(landingLogoScene, {
    elevationDegrees: PUBLIC_LANDING_LOGO_LINK_REVEAL_ELEVATION_DEGREES,
    rotationDegrees: PUBLIC_LANDING_LOGO_LINK_REVEAL_ROTATION_DEGREES[0],
  });

  await expect
    .poll(async () => readLandingLogoSceneView(landingLogoScene))
    .toEqual({
      elevationDegrees: "0.000",
      rotationDegrees: "0.000",
    });

  const logoLink = statusBar.getByRole("link", {
    name: "/logo",
    exact: true,
  });

  await expect(logoLink).toBeVisible();
  await expect(hiddenLogoLink).not.toHaveAttribute("aria-hidden", "true");
  await expect(logoLink).toHaveCSS("animation-name", "underline-color-cycle");

  const logoBox = await logoLink.boundingBox();
  const homeBoxAfter = await homeLink.boundingBox();
  const termsBox = await termsLink.boundingBox();
  expect(logoBox).not.toBeNull();
  expect(homeBoxAfter).not.toBeNull();
  expect(termsBox).not.toBeNull();
  if (logoBox === null || homeBoxAfter === null || termsBox === null) {
    return;
  }

  expect(logoBox.y).toBeLessThan(homeBoxAfter.y);
  expect(Math.abs(logoBox.y - hiddenLogoBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(homeBoxAfter.y - homeBoxBefore.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(termsBox.y - termsBoxBefore.y)).toBeLessThanOrEqual(1);

  await expect(statusBar).toHaveScreenshot(
    "public-landing-status-bar-logo-link.png",
    strictScreenshotOptions,
  );
});

test("prod-ui landing logo keeps the SVG fallback when WebGL is unavailable", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  await page.addInitScript(() => {
    const originalGetContextDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "getContext",
    );
    const originalGetContext = originalGetContextDescriptor?.value;
    if (typeof originalGetContext !== "function") {
      return;
    }

    HTMLCanvasElement.prototype.getContext = function (contextId, ...args) {
      if (
        contextId === "webgl" ||
        contextId === "webgl2" ||
        contextId === "experimental-webgl"
      ) {
        return null;
      }

      return Reflect.apply(originalGetContext, this, [contextId, ...args]);
    };
  });

  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));
  await expect(page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID)).toHaveCount(
    0,
  );
  await page.waitForTimeout(200);
  expect(pageErrors).toEqual([]);
});

test("public landing still renders when localStorage access is denied", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Access denied", "SecurityError");
      },
    });
  });

  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByTestId("public-landing-content")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("public landing stays within the navigation budget", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });

  const navigationTiming = await readNavigationTiming(page);

  expect(navigationTiming).not.toBeNull();
  expect(navigationTiming?.responseEndMs ?? Infinity).toBeLessThan(
    NAVIGATION_BUDGET_MS.responseEnd,
  );
  expect(navigationTiming?.domContentLoadedMs ?? Infinity).toBeLessThan(
    NAVIGATION_BUDGET_MS.domContentLoaded,
  );
  expect(navigationTiming?.loadMs ?? Infinity).toBeLessThan(
    NAVIGATION_BUDGET_MS.load,
  );
});

test("prod-ui mode hides developer password auth controls", async ({
  page,
}) => {
  await page.goto("/?prod-ui", { waitUntil: "networkidle" });

  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Google", includeHidden: true }),
  ).toBeDisabled();

  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Autofill & sign in" }),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
});

test("prod-ui mode keeps landing copy read-only", async ({ page }) => {
  await page.goto("/?prod-ui&dev", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/noter_md", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  await expect(
    page.locator(
      '[data-testid="public-landing-copy"] [contenteditable="true"]',
    ),
  ).toHaveCount(0);
});

test("landing dev toggle preserves unrelated query params", async ({
  page,
}) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const shellToggleLink = page.getByRole("link", {
    name: LANDING_DEV_MODE_LINK_LABEL,
  });
  await expect(shellToggleLink).toHaveAttribute("href", "/?prod-ui&dev");

  await shellToggleLink.click();
  await expect(page).toHaveURL(/\/\?prod-ui&dev$/);

  const appToggleLink = page.getByRole("link", {
    name: LANDING_DEV_MODE_DISABLE_LINK_LABEL,
    exact: true,
  });
  await expect(appToggleLink).toHaveAttribute("href", "/?prod-ui");
});

test("landing dev mode keeps the landing copy read-only after toggling", async ({
  page,
}) => {
  await page.goto("/?dev", { waitUntil: "domcontentloaded" });

  const landingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);

  await expect(landingCopy).toContainText(
    "your notes and code live in a real repository",
  );
  await expect(landingCopy.locator('[contenteditable="true"]')).toHaveCount(0);

  const appToggleLink = page.getByRole("link", {
    name: LANDING_DEV_MODE_DISABLE_LINK_LABEL,
    exact: true,
  });
  await expect(appToggleLink).toBeVisible();
  await appToggleLink.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.locator(
      '[data-testid="public-landing-copy"] [contenteditable="true"]',
    ),
  ).toHaveCount(0);
  await expect(page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID)).toContainText(
    "your notes and code live in a real repository",
  );
});
