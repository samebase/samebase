import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import {
  DRAG_ELEVATION_DEGREES_PER_PIXEL,
  DRAG_ROTATION_DEGREES_PER_PIXEL,
} from "../src/components/logo/logoViewDragConstants";
import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
} from "../src/lib/appBuild";
import {
  LANDING_DEV_MODE_DISABLE_LINK_LABEL,
  LANDING_DEV_MODE_LINK_LABEL,
} from "../src/lib/landingDevMode";
import { ROOT_THEME_LIGHT_MODE_LINK_LABEL } from "../src/lib/rootThemeModeSearch";
import { SEARCH_RESET_LINK_LABEL } from "../src/lib/searchReset";
import {
  PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_COPY_TEST_ID,
  PUBLIC_LANDING_SCROLL_SHELL_TEST_ID,
} from "../src/lib/publicLanding";
import {
  PUBLIC_LANDING_LOGO_SCENE_TEST_ID,
  PUBLIC_LANDING_LOGO_STAGE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
} from "../src/lib/publicLandingLogo";
import { expectScreenshotsToMatch, takeStableScreenshot } from "./visualDiff";

// These budgets target the local production preview used in CI.
// Keep them loose enough to absorb runner variance while still catching
// obvious regressions in the public landing route.
const NAVIGATION_BUDGET_MS = {
  responseEnd: 150,
  domContentLoaded: 400,
  load: 500,
} as const;
const COPY_SHORTCUT_KEY = process.platform === "darwin" ? "Meta+C" : "Control+C";
const PRODUCTION_PUBLIC_HOSTNAME = "noter.md";
const LANDING_FONT_STABLE_SIDEBAR_LINK_LABELS = ["/home", "/terms", "/privacy"] as const;
const strictScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0,
  maxDiffPixels: 0,
} as const;

const { defaultBrowserType: _mobileLandingDefaultBrowserType, ...mobileLandingDevice } =
  devices["iPhone 13"];
const { defaultBrowserType: _androidLandingDefaultBrowserType, ...androidLandingDevice } =
  devices["Pixel 7"];
const iphoneSeLandingDevice = {
  ...mobileLandingDevice,
  viewport: { width: 375, height: 667 },
} as const;
const productionPublicHostLaunchOptions = {
  args: [
    "--disable-session-crashed-bubble",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    `--host-resolver-rules=MAP ${PRODUCTION_PUBLIC_HOSTNAME} 127.0.0.1`,
  ],
};

test.use({
  launchOptions: productionPublicHostLaunchOptions,
});
test.describe.configure({ mode: "serial" });

function buildProductionPublicLandingUrl(search: string): string {
  const playwrightVitePort = process.env.PLAYWRIGHT_VITE_PORT ?? "4173";
  return `http://${PRODUCTION_PUBLIC_HOSTNAME}:${playwrightVitePort}/${search}`;
}

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
  authRowTop: number;
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

type LandingFontStableSidebarLinkLabel = (typeof LANDING_FONT_STABLE_SIDEBAR_LINK_LABELS)[number];

type LandingFontStableRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type LandingFontStableFrame = {
  copy: LandingFontStableRect | null;
  sidebarLinks: Partial<Record<LandingFontStableSidebarLinkLabel, LandingFontStableRect>>;
};

type LandingFontStableCapture = {
  frames: LandingFontStableFrame[];
  webfontRequestCount: number;
};

type RgbaPixel = {
  alpha: number;
  blue: number;
  green: number;
  red: number;
};

declare global {
  interface Window {
    __landingFontStableFrames?: LandingFontStableFrame[];
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
        const root = document.querySelector('[data-testid="public-landing-content"]');
        const rect = root instanceof HTMLElement ? root.getBoundingClientRect() : null;
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
  return await page.evaluate((accountSectionTestId) => {
    const content = document.querySelector('[data-testid="public-landing-content"]');
    const waitlistLink = document.querySelector('a[href="https://x.com/notermd"]');
    const accountSection = document.querySelector(`[data-testid="${accountSectionTestId}"]`);

    if (!(content instanceof HTMLElement)) {
      throw new Error("Expected landing content element");
    }
    if (!(waitlistLink instanceof HTMLElement)) {
      throw new Error("Expected landing waitlist link element");
    }
    if (!(accountSection instanceof HTMLElement)) {
      throw new Error("Expected landing account section element");
    }

    const contentRect = content.getBoundingClientRect();
    const waitlistLinkRect = waitlistLink.getBoundingClientRect();
    const accountSectionRect = accountSection.getBoundingClientRect();

    return {
      authRowTop: Number(accountSectionRect.top.toFixed(3)),
      contentTop: Number(contentRect.top.toFixed(3)),
      contentHeight: Number(contentRect.height.toFixed(3)),
      authRowHeight: Number(accountSectionRect.height.toFixed(3)),
      waitlistLinkTop: Number(waitlistLinkRect.top.toFixed(3)),
      waitlistLinkOffset: Number((waitlistLinkRect.top - contentRect.top).toFixed(3)),
    };
  }, PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
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
    const shell = document.querySelector('[data-workspace-layout-v2="responsive"]');
    const carousel = document.querySelector('[data-testid="workspace-layout-v2-pane-main"]');
    const rightPane = document.querySelector('[data-testid="workspace-layout-v2-pane-right"]');
    const mainPane = carousel?.querySelector(".snap-center > div");
    const content = document.querySelector('[data-testid="public-landing-content"]');
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
    const shell = document.querySelector('[data-workspace-layout-v2="responsive"]');
    const carousel = document.querySelector('[data-testid="workspace-layout-v2-pane-main"]');
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
  const backgroundPixel = readPngPixel(png, geometry.backgroundX, geometry.sampleY);
  const separatorPixel = readPngPixel(png, geometry.separatorX, geometry.sampleY);

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
        content: readRect(document.querySelector('[data-testid="public-landing-content"]')),
        copy: readRect(document.querySelector('[data-testid="public-landing-copy"]')),
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

async function captureLandingFontStableFrames(
  page: Parameters<typeof test>[0]["page"],
): Promise<LandingFontStableCapture> {
  let webfontRequestCount = 0;

  await page.route("**/*.woff2", async (route) => {
    webfontRequestCount += 1;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1_500);
    });
    await route.continue();
  });

  await page.addInitScript(
    ({ statusBarTestId }) => {
      Math.random = () => 0.57;

      const linkLabels = [
        "/home",
        "/terms",
        "/privacy",
      ] as const satisfies readonly LandingFontStableSidebarLinkLabel[];
      const minimumVisibleFrameCount = 10;
      const maximumSampleCount = 600;
      const frameStore: LandingFontStableFrame[] = [];
      let visibleFrameCount = 0;
      window.__landingFontStableFrames = frameStore;

      const readRect = (node: Element | null): LandingFontStableRect | null => {
        if (!(node instanceof HTMLElement)) {
          return null;
        }

        const rect = node.getBoundingClientRect();
        return {
          height: Number(rect.height.toFixed(3)),
          left: Number(rect.left.toFixed(3)),
          top: Number(rect.top.toFixed(3)),
          width: Number(rect.width.toFixed(3)),
        };
      };

      const capture = () => {
        const sidebar = document.querySelector(`[data-testid="${statusBarTestId}"]`);
        const sidebarAnchors = Array.from(sidebar?.querySelectorAll("a") ?? []);
        const sidebarLinks: Partial<
          Record<LandingFontStableSidebarLinkLabel, LandingFontStableRect>
        > = {};

        for (const label of linkLabels) {
          const anchor = sidebarAnchors.find(
            (candidate) => candidate.textContent?.trim() === label,
          );
          sidebarLinks[label] = readRect(anchor ?? null) ?? undefined;
        }

        const copy = readRect(document.querySelector('[data-testid="public-landing-copy"]'));
        const frame = {
          copy,
          sidebarLinks,
        };
        frameStore.push(frame);

        const hasAllSidebarLinks = linkLabels.every(
          (label) => frame.sidebarLinks[label] !== undefined,
        );
        if (copy !== null && hasAllSidebarLinks) {
          visibleFrameCount += 1;
        }

        if (
          frameStore.length < maximumSampleCount &&
          visibleFrameCount < minimumVisibleFrameCount
        ) {
          requestAnimationFrame(capture);
        }
      };

      requestAnimationFrame(capture);
    },
    { statusBarTestId: APP_BUILD_STATUS_BAR_TEST_ID },
  );

  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    ({ labels, minimumVisibleFrameCount, maximumSampleCount }) => {
      const frames = window.__landingFontStableFrames ?? [];
      const visibleFrames = frames.filter((frame) => {
        if (frame.copy === null) {
          return false;
        }
        return labels.every((label) => frame.sidebarLinks[label] !== undefined);
      });

      return (
        visibleFrames.length >= minimumVisibleFrameCount || frames.length >= maximumSampleCount
      );
    },
    {
      labels: LANDING_FONT_STABLE_SIDEBAR_LINK_LABELS,
      maximumSampleCount: 600,
      minimumVisibleFrameCount: 10,
    },
  );

  return {
    frames: await page.evaluate(() => window.__landingFontStableFrames ?? []),
    webfontRequestCount,
  };
}

async function readLandingRightSidebarAuthClip(page: Page) {
  const rightPaneBox = await page.getByTestId("workspace-layout-v2-pane-right").boundingBox();
  expect(rightPaneBox).not.toBeNull();
  if (rightPaneBox === null) {
    throw new Error("Expected landing right pane bounds");
  }

  return {
    height: 320,
    width: rightPaneBox.width,
    x: rightPaneBox.x,
    y: rightPaneBox.y,
  };
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

  expect(Math.max(...contentTopValues) - Math.min(...contentTopValues)).toBeLessThanOrEqual(1);
  expect(Math.max(...copyTopValues) - Math.min(...copyTopValues)).toBeLessThanOrEqual(1);
  expect(Math.max(...copyHeightValues) - Math.min(...copyHeightValues)).toBeLessThanOrEqual(1);
}

function expectStableLandingFontFrames(frames: LandingFontStableFrame[]) {
  const visibleFrames = frames.flatMap((frame) => {
    if (frame.copy === null) {
      return [];
    }

    const hasAllSidebarLinks = LANDING_FONT_STABLE_SIDEBAR_LINK_LABELS.every(
      (label) => frame.sidebarLinks[label] !== undefined,
    );
    return hasAllSidebarLinks ? [frame] : [];
  });

  expect(visibleFrames.length).toBeGreaterThanOrEqual(10);

  const copyHeightValues = visibleFrames.map((frame) => frame.copy!.height);
  const copyLeftValues = visibleFrames.map((frame) => frame.copy!.left);
  const copyTopValues = visibleFrames.map((frame) => frame.copy!.top);
  expect(Math.max(...copyHeightValues) - Math.min(...copyHeightValues)).toBeLessThanOrEqual(1);
  expect(Math.max(...copyLeftValues) - Math.min(...copyLeftValues)).toBeLessThanOrEqual(1);
  expect(Math.max(...copyTopValues) - Math.min(...copyTopValues)).toBeLessThanOrEqual(1);

  for (const label of LANDING_FONT_STABLE_SIDEBAR_LINK_LABELS) {
    const leftValues = visibleFrames.map((frame) => frame.sidebarLinks[label]!.left);
    const topValues = visibleFrames.map((frame) => frame.sidebarLinks[label]!.top);
    const widthValues = visibleFrames.map((frame) => frame.sidebarLinks[label]!.width);
    expect(Math.max(...leftValues) - Math.min(...leftValues)).toBeLessThanOrEqual(1);
    expect(Math.max(...topValues) - Math.min(...topValues)).toBeLessThanOrEqual(1);
    expect(Math.max(...widthValues) - Math.min(...widthValues)).toBeLessThanOrEqual(1);
  }
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
    return `${url.pathname}${url.search}` === expectedPathWithSearch && frame.top !== null
      ? [frame.top]
      : [];
  });
  expect(expectedPathTopValues.length).toBeGreaterThanOrEqual(10);
  expect(
    Math.max(...expectedPathTopValues) - Math.min(...expectedPathTopValues),
  ).toBeLessThanOrEqual(1);
}

async function expectLandingToggleFocusTarget(page: Parameters<typeof test>[0]["page"]) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const activeElement = document.activeElement;
        return activeElement === document.body
          ? "body"
          : activeElement instanceof HTMLElement && activeElement.id === "public-landing-dev-toggle"
            ? "public-landing-dev-toggle"
            : (activeElement?.tagName.toLowerCase() ?? null);
      }),
    )
    .toMatch(/^(body|public-landing-dev-toggle)$/);
}

async function insertLandingHeadingMarker(
  page: Parameters<typeof test>[0]["page"],
  marker: string,
) {
  const editor = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID).locator(".cm-content");
  const headingLine = editor.locator(".cm-line").first();

  await expect(headingLine).toBeVisible();
  await headingLine.click();
  await editor.pressSequentially(` ${marker}`);
  await expect(editor).toContainText(marker);
}

async function expectLandingLogoReady(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(async () =>
      image.evaluate(
        (element) =>
          element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
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

  expect(href).toMatch(/^https:\/\/github\.com\/noter-md\/noter\/commit\/[0-9a-f]{40}$/);

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
  if (termsBox === null || privacyBox === null || versionBox === null || statusBarBox === null) {
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

async function openMobileRightSidebar(page: Page) {
  await page.getByTestId("workspace-layout-v2-pane-main").evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(page.locator("[data-mobile-pane]").first()).toHaveAttribute(
    "data-mobile-pane",
    "right",
  );
}

async function expectBuildVersionFitsVisibleViewport(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate((versionTestId) => {
        const version = document.querySelector(`[data-testid="${versionTestId}"]`);
        const rightPane = document.querySelector('[data-testid="workspace-layout-v2-pane-right"]');
        const scrollingElement = document.scrollingElement;

        if (
          !(version instanceof HTMLElement) ||
          !(rightPane instanceof HTMLElement) ||
          !(scrollingElement instanceof HTMLElement)
        ) {
          return false;
        }

        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const versionRect = version.getBoundingClientRect();
        const rightPaneRect = rightPane.getBoundingClientRect();
        const epsilonPx = 1;

        return (
          versionRect.top >= -epsilonPx &&
          versionRect.bottom <= viewportHeight + epsilonPx &&
          versionRect.top >= rightPaneRect.top - epsilonPx &&
          versionRect.bottom <= rightPaneRect.bottom + epsilonPx &&
          rightPaneRect.bottom <= viewportHeight + epsilonPx &&
          scrollingElement.scrollHeight - scrollingElement.clientHeight <= epsilonPx
        );
      }, APP_BUILD_VERSION_TEST_ID),
    )
    .toBe(true);
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
  await locator.page().mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 20 });
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
      parentColor: parent === null ? null : window.getComputedStyle(parent).color,
      textDecorationLine: linkStyle.textDecorationLine,
    };
  });
}

async function expectLandingLogoAutoRotates(scene: Locator) {
  await expectLandingLogoSceneReady(scene);
  const initialRotationDegrees = await scene.getAttribute("data-rotation-degrees");
  expect(initialRotationDegrees).not.toBeNull();
  if (initialRotationDegrees === null) {
    return;
  }

  await expect
    .poll(async () => {
      const currentRotationDegrees = await scene.getAttribute("data-rotation-degrees");
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
  const currentElevationDegrees = Number.parseFloat(currentView.elevationDegrees ?? "NaN");
  const currentRotationDegrees = Number.parseFloat(currentView.rotationDegrees ?? "NaN");
  expect(Number.isNaN(currentElevationDegrees)).toBe(false);
  expect(Number.isNaN(currentRotationDegrees)).toBe(false);
  if (Number.isNaN(currentElevationDegrees) || Number.isNaN(currentRotationDegrees)) {
    throw new Error("Expected current landing logo view attributes");
  }

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const deltaX =
    (targetView.rotationDegrees - currentRotationDegrees) / DRAG_ROTATION_DEGREES_PER_PIXEL;
  const deltaY =
    (targetView.elevationDegrees - currentElevationDegrees) / DRAG_ELEVATION_DEGREES_PER_PIXEL;

  await scene.page().mouse.move(centerX, centerY);
  await scene.page().mouse.down();
  await scene.page().mouse.move(centerX + deltaX, centerY + deltaY, {
    steps: 12,
  });
  await scene.page().mouse.up();
}

async function expectLandingLogoCanBeDragged(page: Page) {
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
}

test("public landing renders the routed landing UI directly", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByTestId("public-landing-content")).toBeVisible();
  await expect(page.getByTestId(PUBLIC_LANDING_SCROLL_SHELL_TEST_ID)).toBeVisible();
  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));
  const accountSection = page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
  await expect(accountSection).toBeVisible();
  await expect(accountSection.getByRole("button", { name: "not logged in" })).toBeVisible();
  await expect(accountSection.getByRole("link", { name: "?sign-in", exact: true })).toHaveCount(0);
  await accountSection.getByRole("button", { name: "not logged in" }).click();
  await expect(accountSection.getByRole("link", { name: "?sign-in", exact: true })).toBeVisible();
  await expect(
    accountSection.getByRole("link", { name: "?create-account", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Google", includeHidden: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "https://x.com/notermd", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/notermd", exact: true }),
  ).toHaveAttribute("href", "https://x.com/notermd");
});

test("landing sign-in state shows Google sign-in", async ({ page }) => {
  await page.goto("/?sign-in", { waitUntil: "networkidle" });

  const googleButton = page.getByRole("button", { name: "Google" });

  await expect(googleButton).toBeVisible();
  await expect(googleButton).toHaveScreenshot(
    "public-landing-google-button.png",
    strictScreenshotOptions,
  );
});

test("public landing interactive elements use pointer cursors", async ({ page }) => {
  await page.goto("/?sign-in", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Google" })).toHaveCSS("cursor", "pointer");
  await expect(page.getByRole("link", { name: "?create-account", exact: true })).toHaveCSS(
    "cursor",
    "pointer",
  );
  await expect(page.getByRole("link", { name: "https://x.com/notermd", exact: true })).toHaveCSS(
    "cursor",
    "pointer",
  );
});

test("public landing renders the closed Google signup return state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?signup=google", { waitUntil: "networkidle" });

  const accountSection = page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);

  await expect(accountSection).toBeVisible();
  await expect(accountSection.getByText("The app is still internal.")).toBeVisible();
  await expect(accountSection.getByRole("link", { name: "?sign-in" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/notermd", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google", exact: true, includeHidden: true }),
  ).toHaveCount(0);

  await expect(accountSection).toHaveScreenshot(
    "public-landing-google-signup-closed.png",
    strictScreenshotOptions,
  );
});

test("landing dev toggle keeps the account and waitlist rows aligned", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("noter_auth_provider", "google");
  });
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Google", includeHidden: true })).toHaveCount(0);
  await expect(page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)).toBeVisible();
  await expect(page).toHaveScreenshot("public-landing-right-sidebar-account-links.png", {
    ...strictScreenshotOptions,
    clip: await readLandingRightSidebarAuthClip(page),
  });

  const beforeToggleLayout = await readLandingToggleLayout(page);

  await page.getByRole("link", { name: LANDING_DEV_MODE_LINK_LABEL, exact: true }).click();
  await expect(page).toHaveURL(/\/\?dev$/);
  await expect(page.getByRole("button", { name: "Google", includeHidden: true })).toHaveCount(0);
  await expect(page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)).toBeVisible();

  const afterToggleLayout = await readLandingToggleLayout(page);

  expect(
    Math.abs(afterToggleLayout.authRowTop - beforeToggleLayout.authRowTop),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(afterToggleLayout.authRowHeight - beforeToggleLayout.authRowHeight),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(afterToggleLayout.waitlistLinkOffset - beforeToggleLayout.waitlistLinkOffset),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(afterToggleLayout.contentHeight - beforeToggleLayout.contentHeight),
  ).toBeLessThanOrEqual(1);

  await page
    .getByRole("link", {
      name: LANDING_DEV_MODE_DISABLE_LINK_LABEL,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Google", includeHidden: true })).toHaveCount(0);
  await expect(page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)).toBeVisible();

  const afterDisableLayout = await readLandingToggleLayout(page);

  expect(
    Math.abs(afterDisableLayout.authRowTop - afterToggleLayout.authRowTop),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(afterDisableLayout.waitlistLinkOffset - afterToggleLayout.waitlistLinkOffset),
  ).toBeLessThanOrEqual(1);
});

test("public landing omits section divider lines", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");
  await expect(landingContent.locator(".border-t")).toHaveCount(0);
});

test("landing reset shortcut previews reset state without disappearing", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  await page.getByRole("link", { name: ROOT_THEME_LIGHT_MODE_LINK_LABEL, exact: true }).click();
  await expect(page).toHaveURL(/\/\?light$/);

  const resetLink = page.getByRole("link", { name: SEARCH_RESET_LINK_LABEL, exact: true });
  await resetLink.hover();

  await expect(page).toHaveURL(/\/$/);
  await expect(resetLink).toBeVisible();

  await resetLink.click();
  await expect(page).toHaveURL(/\/$/);
});

test("public landing stays vertically stable while the page reloads", async ({ page }) => {
  // `/?prod-ui` mirrors the shipped production shell while suppressing the
  // worktree-only password auth surface that would otherwise add a separate
  // preview-only layout shift on local routes.
  const reloadFrames = await captureLandingReloadFrames(page, "/?prod-ui");

  expectStableLandingReloadFrames(reloadFrames);
});

test("public landing keeps copy and sidebar links stable without bundled fonts", async ({
  page,
}) => {
  const capture = await captureLandingFontStableFrames(page);

  // The landing shell uses the system font stack, so there should be no delayed
  // webfont request that can reflow the copy or sidebar link stack.
  expect(capture.webfontRequestCount).toBe(0);
  expectStableLandingFontFrames(capture.frames);
});

test("local landing keeps the remembered password auth slot stable on reload", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("noter_public_landing_password_auth_mode", "local_worktree_seed");
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Autofill & sign in" })).toBeVisible();

  const reloadFrames = await captureLandingReloadFrames(page);

  expectStableLandingReloadFrames(reloadFrames);
});

test("local landing explains missing worktree autofill credentials", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("noter_public_landing_password_auth_mode", "local_worktree_seed");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const emailInput = page.getByPlaceholder("you@example.com");
  const passwordInput = page.getByPlaceholder("Password");
  await expect(emailInput).toHaveValue("");
  await expect(passwordInput).toHaveValue("");

  await page.getByRole("button", { name: "Autofill & sign in" }).click();

  await expect(
    page.getByText(
      "Autofill is only available from the worktree dev server. Restart with pnpm dev:worktree and reload.",
    ),
  ).toBeVisible();
  await expect(emailInput).toHaveValue("");
  await expect(passwordInput).toHaveValue("");
  await expect(page).toHaveURL("/");
});

test("public landing keeps legal links in the sidebar rail", async ({ page }, testInfo) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");
  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expect(page.getByTestId("workspace-layout-v2-pane-left")).toBeVisible();
  await expectLegalLinksUseRightSidebarInnerEdge(statusBar);
  await expectStatusBarInRightSidebar(page, statusBar);
  await expect(landingContent.getByRole("link", { name: "/terms" })).toHaveCount(0);
  await expect(landingContent.getByRole("link", { name: "/privacy" })).toHaveCount(0);

  const statusBarScreenshot = await takeStableScreenshot(statusBar);
  await testInfo.attach("public-landing-status-bar", {
    body: statusBarScreenshot,
    contentType: "image/png",
  });
});

test("public landing keeps both side panes mounted on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "networkidle" });

  const workspace = page.locator('[data-workspace-layout-v2="responsive"]');
  const leftPane = page.getByTestId("workspace-layout-v2-pane-left");
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");

  await expect(workspace).toBeVisible();
  await expect(leftPane).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle Left Sidebar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle sidebar" })).toHaveCount(0);
  await expect
    .poll(async () =>
      leftPane.evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    )
    .toBe(240);
  await expect
    .poll(async () =>
      rightPane.evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    )
    .toBe(288);
});

test("mcp consent sign-in keeps legal links in the sidebar rail", async ({ page }) => {
  await page.goto("/oauth/mcp/consent?mcp_consent_request=mcpar_test&mcp_login_required=1", {
    waitUntil: "networkidle",
  });

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

test("build version copies as a Markdown link on the public landing", async ({ page }) => {
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

test("landing footer links keep browser link styling", async ({ page }, testInfo) => {
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

  test("landing fits below the mobile route header without vertical scrolling", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 390, height: 450 });

    await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));

    const mobileShell = page.locator('[data-workspace-layout-v2="responsive"]');
    await expect(mobileShell).toHaveAttribute("data-mobile-pane", "main");
    await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(1);
    await expect(page.getByTestId("workspace-layout-v2-main-pane-header")).toBeVisible();
    await expect(page.getByTestId("route-url-editor")).toBeVisible();
    await expect(page.getByRole("button", { name: "Toggle Left Sidebar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Toggle sidebar" })).toHaveCount(0);

    const verticalOverflow = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="public-landing-scroll-shell"]');
      const scrollingElement = document.scrollingElement;

      if (!(shell instanceof HTMLElement)) {
        throw new Error("Expected landing shell");
      }
      if (!(scrollingElement instanceof HTMLElement)) {
        throw new Error("Expected document scrolling element");
      }

      let routeScrollport = shell.parentElement;
      while (routeScrollport) {
        const overflowY = getComputedStyle(routeScrollport).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") {
          break;
        }
        routeScrollport = routeScrollport.parentElement;
      }

      if (!(routeScrollport instanceof HTMLElement)) {
        throw new Error("Expected landing route scrollport");
      }

      return {
        documentOverflow: scrollingElement.scrollHeight - scrollingElement.clientHeight,
        routeOverflow: routeScrollport.scrollHeight - routeScrollport.clientHeight,
      };
    });

    expect(verticalOverflow.documentOverflow).toBeLessThanOrEqual(1);
    expect(verticalOverflow.routeOverflow).toBeLessThanOrEqual(1);
  });

  test("landing avoids an inner scroll shell on mobile", async ({ page }) => {
    await page.goto("/?prod-ui", { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 390, height: 320 });

    const scrollOwnership = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="public-landing-scroll-shell"]');
      const scrollingElement = document.scrollingElement;

      if (!(shell instanceof HTMLElement)) {
        throw new Error("Expected landing shell");
      }
      if (!(scrollingElement instanceof HTMLElement)) {
        throw new Error("Expected document scrolling element");
      }

      const shellStyle = getComputedStyle(shell);
      return {
        documentCanScroll: scrollingElement.scrollHeight > scrollingElement.clientHeight,
        shellOverflowY: shellStyle.overflowY,
      };
    });

    expect(scrollOwnership.shellOverflowY).not.toBe("auto");

    const scrollTop = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="public-landing-scroll-shell"]');
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

    if (scrollOwnership.documentCanScroll) {
      expect(scrollTop.documentScrollTop).toBeGreaterThan(0);
    } else {
      expect(scrollTop.documentScrollTop).toBe(0);
    }
    expect(scrollTop.shellScrollTop).toBe(0);
  });

  test("landing dev toggle keeps the landing card stable frame by frame", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const forwardFrames = await captureLandingToggleFrames(page, LANDING_DEV_MODE_LINK_LABEL);
    expectStableLandingToggleFrames(forwardFrames, "/?dev");
    await expectLandingToggleFocusTarget(page);
    await expectLandingLogoAutoRotates(page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID));

    const backFrames = await captureLandingToggleFrames(page, LANDING_DEV_MODE_DISABLE_LINK_LABEL);
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

    await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(1);

    const beforeSlideMetrics = await readLandingRightSidebarCopyMetrics(page);

    await page.getByTestId("workspace-layout-v2-pane-main").evaluate((element) => {
      // The regression happened when pane ownership changed mid-gesture.
      const rightPane = document.querySelector('[data-testid="workspace-layout-v2-pane-right"]');
      if (!(rightPane instanceof HTMLElement)) {
        throw new Error("Expected landing right pane");
      }

      element.style.scrollSnapType = "none";
      element.scrollLeft +=
        rightPane.getBoundingClientRect().right - element.getBoundingClientRect().right;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    await expect(page.locator('[data-workspace-layout-v2="responsive"]')).toHaveAttribute(
      "data-mobile-pane",
      "right",
    );

    const afterSlideMetrics = await readLandingRightSidebarCopyMetrics(page);

    // This invariant intentionally has no pixel tolerance: a 1px pane or
    // content-box change can rewrap text and means the shell geometry shifted.
    expect(afterSlideMetrics.shellWidth).toBe(beforeSlideMetrics.shellWidth);
    expect(afterSlideMetrics.carouselWidth).toBe(beforeSlideMetrics.carouselWidth);
    expect(afterSlideMetrics.rightPaneWidth).toBe(beforeSlideMetrics.rightPaneWidth);
    expect(afterSlideMetrics.rightPaneClientWidth).toBe(beforeSlideMetrics.rightPaneClientWidth);
    expect(afterSlideMetrics.mainPaneWidth).toBe(beforeSlideMetrics.mainPaneWidth);
    expect(afterSlideMetrics.mainPaneClientWidth).toBe(beforeSlideMetrics.mainPaneClientWidth);
    expect(afterSlideMetrics.contentWidth).toBe(beforeSlideMetrics.contentWidth);
    expect(afterSlideMetrics.teamTextHeight).toBe(beforeSlideMetrics.teamTextHeight);

    const separatorPaint = await readLandingRightSidebarSeparatorPaint(page);
    expect(separatorPaint.separatorPixel.alpha).toBe(255);
    expect(separatorPaint.colorDistance).toBeGreaterThan(10);
  });
});

test.describe("Android-sized standalone display-mode landing right sidebar", () => {
  test.use({
    ...androidLandingDevice,
  });

  test("keeps the build version visible after refreshing with the right sidebar open", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (query === "(display-mode: standalone)") {
          return {
            addEventListener() {},
            addListener() {},
            dispatchEvent() {
              return false;
            },
            matches: true,
            media: query,
            onchange: null,
            removeEventListener() {},
            removeListener() {},
          };
        }

        return originalMatchMedia(query);
      };
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));

    await openMobileRightSidebar(page);
    await expectBuildVersionFitsVisibleViewport(page);

    await page.reload({ waitUntil: "networkidle" });
    await expectBuildVersionFitsVisibleViewport(page);
  });
});

test("landing dev toggle cancels duplicate synthetic clicks", async ({ page }) => {
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

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("link", { name: LANDING_DEV_MODE_LINK_LABEL, exact: true }),
  ).toBeVisible();
});

test("waitlist link stays visible through the dev toggle", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const waitlistLink = page.getByRole("link", {
    name: "https://x.com/notermd",
    exact: true,
  });
  await expect(waitlistLink).toBeVisible();
  await expect(waitlistLink).toHaveAttribute("href", "https://x.com/notermd");
  await page.getByRole("link", { name: LANDING_DEV_MODE_LINK_LABEL, exact: true }).click();
  await expect(page).toHaveURL(/\/\?dev$/);
  await expect(
    page.getByRole("link", { name: "https://x.com/notermd", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/notermd", exact: true }),
  ).toHaveAttribute("href", "https://x.com/notermd");
});

test("public landing keeps the card height stable while toggling dev mode", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");
  await expect(landingContent).toBeVisible();
  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));

  const plainLandingHeight = await landingContent.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height),
  );

  await page.getByRole("link", { name: LANDING_DEV_MODE_LINK_LABEL, exact: true }).click();
  await expect(page).toHaveURL(/\/\?dev$/);

  const devLandingHeight = await landingContent.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height),
  );

  expect(Math.abs(devLandingHeight - plainLandingHeight)).toBeLessThanOrEqual(8);
});

test("prod-ui landing logo enhancement stays visually aligned", async ({ page }, testInfo) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const landingLogo = page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID);
  const landingLogoStage = page.getByTestId(PUBLIC_LANDING_LOGO_STAGE_TEST_ID);
  await expectLandingLogoReady(landingLogo);

  const initialLogoScreenshot = await takeStableScreenshot(landingLogoStage);

  await expectLandingLogoSceneReady(page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID));

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

  await expectLandingLogoCanBeDragged(page);
});

test("public landing logo becomes draggable after the SVG fallback is removed", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expectLandingLogoCanBeDragged(page);
});

test("prod-ui landing keeps /logo out of the right sidebar", async ({ page }) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const landingLogo = page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID);
  const landingLogoScene = page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID);

  await expectLandingLogoReady(landingLogo);
  await expectLandingLogoSceneReady(landingLogoScene);

  const homeLink = statusBar.getByRole("link", {
    name: "/home",
    exact: true,
  });
  const termsLink = statusBar.getByRole("link", {
    name: "/terms",
    exact: true,
  });

  await expect(statusBar.getByRole("link", { name: "/logo", exact: true })).toHaveCount(0);
  await expect(homeLink).toBeVisible();
  await expect(termsLink).toBeVisible();

  const homeBoxBefore = await homeLink.boundingBox();
  const termsBoxBefore = await termsLink.boundingBox();
  expect(homeBoxBefore).not.toBeNull();
  expect(termsBoxBefore).not.toBeNull();
  if (homeBoxBefore === null || termsBoxBefore === null) {
    return;
  }

  await dragLandingLogoSceneToView(landingLogoScene, {
    elevationDegrees: 0,
    rotationDegrees: 0,
  });

  await expect
    .poll(async () => readLandingLogoSceneView(landingLogoScene))
    .toEqual({
      elevationDegrees: "0.000",
      rotationDegrees: "0.000",
    });

  await expect(statusBar.getByRole("link", { name: "/logo", exact: true })).toHaveCount(0);

  const homeBoxAfter = await homeLink.boundingBox();
  const termsBox = await termsLink.boundingBox();
  expect(homeBoxAfter).not.toBeNull();
  expect(termsBox).not.toBeNull();
  if (homeBoxAfter === null || termsBox === null) {
    return;
  }

  expect(Math.abs(homeBoxAfter.y - homeBoxBefore.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(termsBox.y - termsBoxBefore.y)).toBeLessThanOrEqual(1);

  await expect(statusBar).toHaveScreenshot("public-landing-status-bar-no-logo-link.png", {
    ...strictScreenshotOptions,
    // Build metadata changes on every main commit; this screenshot protects
    // the stable public-route link stack without pinning the current release label.
    mask: [statusBar.getByTestId(APP_BUILD_VERSION_TEST_ID).locator("xpath=..")],
    maskColor: "#ffffff",
  });
});

test("prod-ui landing logo keeps the SVG fallback when WebGL is unavailable", async ({ page }) => {
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
      if (contextId === "webgl" || contextId === "webgl2" || contextId === "experimental-webgl") {
        return null;
      }

      return Reflect.apply(originalGetContext, this, [contextId, ...args]);
    };
  });

  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  await expectLandingLogoReady(page.getByTestId(PUBLIC_LANDING_LOGO_TEST_ID));
  await expect(page.getByTestId(PUBLIC_LANDING_LOGO_SCENE_TEST_ID)).toHaveCount(0);
  await page.waitForTimeout(200);
  expect(pageErrors).toEqual([]);
});

test("public landing still renders when localStorage access is denied", async ({ page }) => {
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
  expect(navigationTiming?.loadMs ?? Infinity).toBeLessThan(NAVIGATION_BUDGET_MS.load);
});

test("prod-ui mode hides developer password auth controls", async ({ page }) => {
  await page.goto("/?prod-ui", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Google", includeHidden: true })).toHaveCount(0);
  await expect(page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)).toBeVisible();

  await expect(
    page.getByRole("link", { name: "https://x.com/notermd", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Autofill & sign in" })).toHaveCount(0);
  await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
});

test("prod-ui mode does not override landing dev editing", async ({ page }) => {
  const headingMarker = "prod-ui-dev-marker";

  await page.goto("/?prod-ui&dev", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: "Google", includeHidden: true })).toHaveCount(0);
  await expect(page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://x.com/notermd", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  const landingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);
  await expect(landingCopy.locator('[contenteditable="true"]')).toHaveCount(1);

  await insertLandingHeadingMarker(page, headingMarker);
  await expect(landingCopy).toContainText(headingMarker);
});

test.describe("production public host landing", () => {
  test("keeps the logo draggable after the SVG fallback is removed", async ({ page }) => {
    await page.goto(buildProductionPublicLandingUrl(""), {
      waitUntil: "domcontentloaded",
    });

    await expectLandingLogoCanBeDragged(page);
  });

  test("keeps ?dev landing copy editable", async ({ page }) => {
    const headingMarker = "prod-host-marker";

    await page.goto(buildProductionPublicLandingUrl("?dev"), {
      waitUntil: "domcontentloaded",
    });

    const landingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);
    await landingCopy.waitFor({ state: "visible" });
    await expect(landingCopy.locator('[contenteditable="true"]')).toHaveCount(1);

    await insertLandingHeadingMarker(page, headingMarker);
    await expect(landingCopy).toContainText(headingMarker);
  });
});

test("landing dev toggle preserves unrelated query params", async ({ page }) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  const shellToggleLink = page.getByRole("link", {
    name: LANDING_DEV_MODE_LINK_LABEL,
  });
  await expect(shellToggleLink).toHaveAttribute("href", "/?prod-ui&dev");

  await shellToggleLink.focus();
  await shellToggleLink.press("Enter");
  await expect(page).toHaveURL(/\/\?(?:prod-ui&dev|dev&prod-ui)$/);

  const appToggleLink = page.getByRole("link", {
    name: LANDING_DEV_MODE_DISABLE_LINK_LABEL,
    exact: true,
  });
  await expect(appToggleLink).toHaveAttribute("href", "/?prod-ui");
});

test("prod-ui mode omits the prod-ui shortcut", async ({ page }) => {
  await page.goto("/?prod-ui", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#public-landing-prod-ui-toggle")).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: LANDING_DEV_MODE_LINK_LABEL,
      exact: true,
    }),
  ).toBeVisible();
});

test("prod-ui shortcut is not rendered before entry", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#public-landing-prod-ui-toggle")).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: LANDING_DEV_MODE_LINK_LABEL,
      exact: true,
    }),
  ).toBeVisible();
});

test("landing dev edits stay visible after toggling back to the plain landing view", async ({
  page,
}) => {
  const headingMarker = "codex-marker";

  await page.goto("/?dev", { waitUntil: "domcontentloaded" });

  const landingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);

  await expect(landingCopy).toContainText("your notes and code live in a real repository");
  await expect(landingCopy.locator('[contenteditable="true"]')).toHaveCount(1);

  await insertLandingHeadingMarker(page, headingMarker);

  const appToggleLink = page.getByRole("link", {
    name: LANDING_DEV_MODE_DISABLE_LINK_LABEL,
    exact: true,
  });
  await expect(appToggleLink).toBeVisible();
  await appToggleLink.press("Enter");

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.locator('[data-testid="public-landing-copy"] [contenteditable="true"]'),
  ).toHaveCount(0);
  await expect(page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID)).toContainText(headingMarker);
});
