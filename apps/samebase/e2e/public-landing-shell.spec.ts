import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
} from "../src/lib/appBuild";
import { PRODUCTION_PUBLIC_HOSTNAME } from "../src/lib/prodUiMode";
import {
  PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_COPY_TEST_ID,
  PUBLIC_LANDING_MENGER_TEST_ID,
  PUBLIC_LANDING_SCROLL_SHELL_TEST_ID,
} from "../src/lib/publicLanding";
import { formatRouteSearchPresenceFlagLinkLabel } from "../src/routing/searchFlags";
import { SEARCH_RESET_QUERY_PARAM } from "../src/lib/searchReset";

const COPY_SHORTCUT_KEY = process.platform === "darwin" ? "Meta+C" : "Control+C";
const LANDING_FONT_STABLE_SIDEBAR_LINK_LABELS = ["/terms", "/privacy", "/landing"] as const;
const searchResetLinkLabel = formatRouteSearchPresenceFlagLinkLabel(SEARCH_RESET_QUERY_PARAM, true);
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

function buildProductionPublicLandingUrl(search: string): string {
  const playwrightVitePort = process.env.PLAYWRIGHT_VITE_PORT ?? "4173";
  return `http://${PRODUCTION_PUBLIC_HOSTNAME}:${playwrightVitePort}/${search}`;
}

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

async function readLandingRightSidebarCopyMetrics(page: Page): Promise<{
  carouselWidth: number;
  contentWidth: number;
  copyHeight: number;
  mainPaneWidth: number;
  mainPaneClientWidth: number;
  rightPaneClientWidth: number;
  rightPaneWidth: number;
  shellWidth: number;
}> {
  return await page.evaluate(() => {
    const shell = document.querySelector('[data-workspace-layout-v2="responsive"]');
    const carousel = document.querySelector('[data-testid="workspace-layout-v2-pane-main"]');
    const rightPane = document.querySelector('[data-testid="workspace-layout-v2-pane-right"]');
    const mainPane = carousel?.querySelector(".snap-center > div");
    const content = document.querySelector('[data-testid="public-landing-content"]');
    const copy = document.querySelector('[data-testid="public-landing-copy"]');

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
    if (!(copy instanceof HTMLElement)) {
      throw new Error("Expected landing copy");
    }

    return {
      carouselWidth: Math.round(carousel.getBoundingClientRect().width),
      contentWidth: Math.round(content.getBoundingClientRect().width),
      copyHeight: Math.round(copy.getBoundingClientRect().height),
      mainPaneWidth: Math.round(mainPane.getBoundingClientRect().width),
      mainPaneClientWidth: mainPane.clientWidth,
      rightPaneClientWidth: rightPane.clientWidth,
      rightPaneWidth: Math.round(rightPane.getBoundingClientRect().width),
      shellWidth: Math.round(shell.getBoundingClientRect().width),
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
        "/terms",
        "/privacy",
        "/landing",
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

async function expectRootLandingMengerReady(page: Page) {
  const hero = page.getByTestId(PUBLIC_LANDING_MENGER_TEST_ID);
  const scene = hero.getByTestId("logo-menger-hover-scene");

  await expect(hero).toBeVisible();
  await expect(scene.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expect(hero).toHaveAttribute("data-state", "ready");
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

  expect(href).toMatch(/^https:\/\/github\.com\/samebase\/samebase\/commit\/[0-9a-f]{40}$/);

  return href;
}

async function expectLegalLinksUseRightSidebarInnerEdge(statusBar: Locator) {
  const termsLink = statusBar.getByRole("link", { name: "/terms" });
  const privacyLink = statusBar.getByRole("link", { name: "/privacy" });
  const landingLink = statusBar.getByRole("link", { name: "/landing" });
  const versionLabel = statusBar.getByTestId(APP_BUILD_VERSION_TEST_ID);

  await expect(termsLink).toBeVisible();
  await expect(privacyLink).toBeVisible();
  await expect(landingLink).toHaveAttribute("href", "/");
  await expect(landingLink).toBeVisible();
  await expect(versionLabel).toBeVisible();

  const termsBox = await termsLink.boundingBox();
  const privacyBox = await privacyLink.boundingBox();
  const landingBox = await landingLink.boundingBox();
  const versionBox = await versionLabel.boundingBox();
  const statusBarBox = await statusBar.boundingBox();
  expect(termsBox).not.toBeNull();
  expect(privacyBox).not.toBeNull();
  expect(landingBox).not.toBeNull();
  expect(versionBox).not.toBeNull();
  expect(statusBarBox).not.toBeNull();
  if (
    termsBox === null ||
    privacyBox === null ||
    landingBox === null ||
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
  for (const childBox of [termsBox, privacyBox, landingBox, versionBox]) {
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

test("public landing renders the routed landing UI directly", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");
  await expect(landingContent).toBeVisible();
  await expect(landingContent.locator(".border-t")).toHaveCount(0);
  await expect(page.getByTestId(PUBLIC_LANDING_SCROLL_SHELL_TEST_ID)).toBeVisible();
  await expectRootLandingMengerReady(page);
  await expect(page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID)).toHaveText("Samebase is near.");
  const accountSection = page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
  await expect(accountSection).toBeVisible();
  await expect(
    accountSection.getByText("Sign in or create an account", { exact: true }),
  ).toBeVisible();
  await expect(accountSection.locator("[aria-expanded]")).toHaveCount(0);
  await expect(accountSection.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(accountSection.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
});

test("public landing shows OAuth sign-in methods by default", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const googleButton = page.getByRole("button", { name: "Continue with Google" });
  const githubButton = page.getByRole("button", { name: "Continue with GitHub" });

  await expect(googleButton).toBeVisible();
  await expect(githubButton).toBeVisible();
  await expect(googleButton).toHaveCSS("cursor", "pointer");
  await expect(githubButton).toHaveCSS("cursor", "pointer");
  await expect(googleButton).toHaveScreenshot("public-landing-google-button.png", {
    ...strictScreenshotOptions,
    timeout: 15_000,
  });
  await expect(githubButton).toHaveScreenshot("public-landing-github-button.png", {
    ...strictScreenshotOptions,
    timeout: 15_000,
  });
});

test("public landing renders the closed OAuth signup return state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?signup=google", { waitUntil: "networkidle" });

  const accountSection = page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);

  await expect(accountSection).toBeVisible();
  await expect(accountSection.getByText("The app is still internal.")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Continue with Google",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Continue with GitHub",
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(0);
  await expect(accountSection.getByPlaceholder("you@example.com")).toHaveCount(0);
  await expect(accountSection.getByPlaceholder("Password")).toHaveCount(0);

  await expect(accountSection).toHaveScreenshot("public-landing-google-signup-closed.png", {
    ...strictScreenshotOptions,
    timeout: 15_000,
  });
});

test("landing reset shortcut stays visible before clearing root search", async ({ page }) => {
  await page.goto("/?light", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/\?light$/);

  const resetLink = page.getByRole("link", { name: searchResetLinkLabel, exact: true });
  await resetLink.hover();

  await expect(page).toHaveURL(/\/\?light$/);
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
    localStorage.setItem("samebase_public_landing_password_auth_mode", "local_worktree_seed");
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Autofill & sign in" })).toBeVisible();

  const reloadFrames = await captureLandingReloadFrames(page);

  expectStableLandingReloadFrames(reloadFrames);
});

test("public landing keeps legal links in the right sidebar rail", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingContent = page.getByTestId("public-landing-content");
  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(0);
  await expectLegalLinksUseRightSidebarInnerEdge(statusBar);
  await expectStatusBarInRightSidebar(page, statusBar);
  await expect(landingContent.getByRole("link", { name: "/terms" })).toHaveCount(0);
  await expect(landingContent.getByRole("link", { name: "/privacy" })).toHaveCount(0);
  await expect(landingContent.getByRole("link", { name: "/landing" })).toHaveCount(0);
  await expect(statusBar.getByRole("link", { name: "/terms", exact: true })).toHaveCSS(
    "text-decoration-line",
    "underline",
  );
});

test("public landing keeps the right pane mounted without a left pane on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/", { waitUntil: "networkidle" });

  const workspace = page.locator('[data-workspace-layout-v2="responsive"]');
  const rightPane = page.getByTestId("workspace-layout-v2-pane-right");

  await expect(workspace).toBeVisible();
  await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Toggle Left Sidebar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Toggle sidebar" })).toHaveCount(0);
  await expect
    .poll(async () =>
      rightPane.evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    )
    .toBe(288);
});

test("mcp consent sign-in keeps legal links in the sidebar rail", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    "/oauth/mcp/consent?mcp_consent_request=mcpar_test&mcp_login_required=1&signup=google",
    {
      waitUntil: "networkidle",
    },
  );

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Toggle Left Sidebar" })).toHaveCount(0);
  await expectLegalLinksUseRightSidebarInnerEdge(statusBar);
  await expectStatusBarInRightSidebar(page, statusBar);
  await expect(statusBar.getByRole("link", { name: "/vault" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await expect(page.getByText("Use the account sidebar to sign in")).toBeVisible();
  await expect(
    page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID).getByRole("button", {
      name: "Continue with Google",
    }),
  ).toBeVisible();
  await expect(
    page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID).getByRole("button", {
      name: "Continue with GitHub",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("workspace-layout-v2-pane-main")).toHaveScreenshot(
    "mcp-consent-sign-in-no-left-sidebar.png",
    {
      ...strictScreenshotOptions,
      mask: [page.getByTestId(APP_BUILD_VERSION_TEST_ID).locator("xpath=..")],
      maskColor: "#ffffff",
    },
  );
});

test("build version copies as a Markdown link on the public landing", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/", { waitUntil: "networkidle" });

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const version = page.getByTestId(APP_BUILD_VERSION_TEST_ID);
  const commit = page.getByTestId(APP_BUILD_COMMIT_LINK_TEST_ID);
  await expectAppBuildVersionDisplay(statusBar, version, commit);
  const versionText = await version.textContent();
  const versionHref = await expectAppBuildCommitLink(commit);
  expect(versionText).not.toBeNull();
  await selectText(commit);
  await page.keyboard.press(COPY_SHORTCUT_KEY);
  const clipboardText = await readClipboardText(page);
  expect(clipboardText).toBe(`[${versionText}](${versionHref})`);
});

test.describe("mobile landing shell", () => {
  test.use(mobileLandingDevice);

  test("landing fits below the mobile address chrome without vertical scrolling", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 390, height: 450 });

    await expectRootLandingMengerReady(page);
    const mengerScene = page
      .getByTestId(PUBLIC_LANDING_MENGER_TEST_ID)
      .getByTestId("logo-menger-hover-scene");
    await expect(mengerScene).toHaveAttribute("data-menger-automatic-probe", "play");
    await expect(mengerScene).toHaveAttribute("data-automatic-probe-state", "playing");
    await expect(mengerScene).toHaveAttribute("data-menger-pointer-tilt", "off");
    await expect(mengerScene).toHaveAttribute("data-presentation-horizontal-degrees", "0.000");
    await expect(mengerScene).toHaveAttribute("data-presentation-vertical-degrees", "0.000");

    const mobileShell = page.locator('[data-workspace-layout-v2="responsive"]');
    const addressChrome = page.getByTestId("workspace-layout-v2-address-chrome");
    await expect(mobileShell).toHaveAttribute("data-mobile-pane", "main");
    await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(0);
    await expect(addressChrome).toBeVisible();
    await expect(addressChrome.getByTestId("route-url-editor")).toBeVisible();
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
});

test.describe("iPhone SE landing sidebar", () => {
  test.use(iphoneSeLandingDevice);

  test("keeps mobile pane dimensions exact while sliding to the right sidebar", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(0);

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
    expect(afterSlideMetrics.copyHeight).toBe(beforeSlideMetrics.copyHeight);

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
    await expectRootLandingMengerReady(page);

    await openMobileRightSidebar(page);
    await expectBuildVersionFitsVisibleViewport(page);

    await page.reload({ waitUntil: "networkidle" });
    await expectBuildVersionFitsVisibleViewport(page);
  });
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

test("prod-ui mode hides developer password auth controls", async ({ page }) => {
  await page.goto("/?prod-ui", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)).toBeVisible();

  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Autofill & sign in" })).toHaveCount(0);
  await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
});

test("prod-ui mode does not override landing dev editing", async ({ page }) => {
  const headingMarker = "prod-ui-dev-marker";

  await page.goto("/?prod-ui&dev", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)).toBeVisible();
  await expect(page.getByText("Password auth (dev)")).toHaveCount(0);
  const landingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);
  await expect(landingCopy.locator('[contenteditable="true"]')).toHaveCount(1);

  await insertLandingHeadingMarker(page, headingMarker);
  await expect(landingCopy).toContainText(headingMarker);
});

test.describe("production public host landing", () => {
  test("keeps the production URL editor inset and editable across routes", async ({ page }) => {
    const focusRouteEditor = async () => {
      await expect(async () => {
        await page.getByTestId("route-url-editor-display").click();
        await expect(page.getByTestId("route-url-editor-input")).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      return page.getByTestId("route-url-editor-input");
    };
    const rootUrl = buildProductionPublicLandingUrl("");
    const rootPrefix = `${new URL(rootUrl).origin}/`;
    const response = await page.goto(rootUrl, {
      waitUntil: "domcontentloaded",
    });
    if (response === null) {
      throw new Error("Expected production host landing response.");
    }

    const html = await response.text();
    const routeEditorDisplayTag = html.match(
      /<input[^>]*data-testid="route-url-editor-display"[^>]*>/,
    )?.[0];
    if (!routeEditorDisplayTag) {
      throw new Error("Expected route URL editor display in production host HTML.");
    }

    expect(routeEditorDisplayTag).toContain(`value="/"`);
    expect(routeEditorDisplayTag).not.toContain("text-indent");

    const displayInput = page.getByTestId("route-url-editor-display");
    await expect(displayInput).toHaveValue("/");

    const focusedInput = await focusRouteEditor();
    await expect(focusedInput).toHaveValue(rootPrefix);
    await focusedInput.pressSequentially("logo");

    await expect(focusedInput).toHaveValue(`${rootPrefix}logo`);
    await expect(page).toHaveURL(/\/logo$/);

    await page.goto(buildProductionPublicLandingUrl("privacy"), {
      waitUntil: "domcontentloaded",
    });

    const privacyDisplayInput = page.getByTestId("route-url-editor-display");
    await expect(privacyDisplayInput).toHaveValue("/privacy");

    const privacyFocusedInput = await focusRouteEditor();
    await expect(privacyFocusedInput).toHaveValue(`${rootPrefix}privacy?`);
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

test("landing dev edits stay visible after clearing the dev query", async ({ page }) => {
  const headingMarker = "codex-marker";

  await page.goto("/?dev", { waitUntil: "domcontentloaded" });

  const landingCopy = page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID);

  await expect(landingCopy).toContainText("Samebase is near.");
  await expect(landingCopy.locator('[contenteditable="true"]')).toHaveCount(1);

  await insertLandingHeadingMarker(page, headingMarker);

  const resetLink = page.getByRole("link", { exact: true, name: searchResetLinkLabel });
  await resetLink.press("Enter");

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.locator('[data-testid="public-landing-copy"] [contenteditable="true"]'),
  ).toHaveCount(0);
  await expect(page.getByTestId(PUBLIC_LANDING_COPY_TEST_ID)).toContainText(headingMarker);
});
