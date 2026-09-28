import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import {
  APP_BUILD_COMMIT_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
} from "../src/lib/appBuild";
import { PRODUCTION_PUBLIC_HOSTNAME } from "../src/lib/prodUiMode";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "../src/publicSite/publicLanding";
import { LANDING_PREVIEW_ARTICLE_TEST_ID } from "../src/routeSearch/landingPreview";
import { formatRouteSearchPresenceFlagLinkLabel } from "../src/routing/searchFlags";
import { SEARCH_RESET_QUERY_PARAM } from "../src/lib/searchReset";

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

type RgbaPixel = {
  alpha: number;
  blue: number;
  green: number;
  red: number;
};

async function readLandingRightSidebarCopyMetrics(page: Page): Promise<{
  articleWidth: number;
  carouselWidth: number;
  headingHeight: number;
  mainPaneWidth: number;
  mainPaneClientWidth: number;
  rightPaneClientWidth: number;
  rightPaneWidth: number;
  shellWidth: number;
}> {
  return await page.evaluate(() => {
    const shell = document.querySelector('[data-sidebar-layout-part="viewport"]');
    const carousel = document.querySelector('[data-sidebar-layout-part="carousel"]');
    const rightPane = document.querySelector(
      '[data-sidebar-layout-part="pane"][data-pane-side="right"]',
    );
    const mainPane = carousel?.querySelector(
      '[data-sidebar-layout-part="pane"][data-pane-side="main"] > [data-sidebar-layout-part="pane-surface"]',
    );
    const article = document.querySelector('[data-testid="landing-preview-article"]');
    const heading = article?.querySelector("h1");

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
    if (!(article instanceof HTMLElement)) {
      throw new Error("Expected landing article");
    }
    if (!(heading instanceof HTMLElement)) {
      throw new Error("Expected landing heading");
    }

    return {
      articleWidth: Math.round(article.getBoundingClientRect().width),
      carouselWidth: Math.round(carousel.getBoundingClientRect().width),
      headingHeight: Math.round(heading.getBoundingClientRect().height),
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
    const shell = document.querySelector('[data-sidebar-layout-part="viewport"]');
    const carousel = document.querySelector('[data-sidebar-layout-part="carousel"]');
    const mainPane = carousel?.querySelector(
      '[data-sidebar-layout-part="pane"][data-pane-side="main"] > [data-sidebar-layout-part="pane-surface"]',
    );

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

async function expectLegalLinksUseRightSidebarInnerEdge(statusBar: Locator) {
  const termsLink = statusBar.getByRole("link", { name: "/terms" });
  const privacyLink = statusBar.getByRole("link", { name: "/privacy" });
  const pricingLink = statusBar.getByRole("link", { name: "/pricing" });
  const landingLink = statusBar.getByRole("link", { name: "/landing" });
  const versionLabel = statusBar.getByTestId(APP_BUILD_VERSION_TEST_ID);

  await expect(termsLink).toBeVisible();
  await expect(privacyLink).toBeVisible();
  await expect(pricingLink).toHaveAttribute("href", "/pricing");
  await expect(pricingLink).toBeVisible();
  await expect(landingLink).toHaveAttribute("href", "/");
  await expect(landingLink).toBeVisible();
  await expect(versionLabel).toBeVisible();

  const termsBox = await termsLink.boundingBox();
  const privacyBox = await privacyLink.boundingBox();
  const pricingBox = await pricingLink.boundingBox();
  const landingBox = await landingLink.boundingBox();
  const versionBox = await versionLabel.boundingBox();
  const statusBarBox = await statusBar.boundingBox();
  expect(termsBox).not.toBeNull();
  expect(privacyBox).not.toBeNull();
  expect(pricingBox).not.toBeNull();
  expect(landingBox).not.toBeNull();
  expect(versionBox).not.toBeNull();
  expect(statusBarBox).not.toBeNull();
  if (
    termsBox === null ||
    privacyBox === null ||
    pricingBox === null ||
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
  for (const childBox of [termsBox, privacyBox, pricingBox, landingBox, versionBox]) {
    expect(Math.abs(childBox.x - expectedLeftEdge)).toBeLessThanOrEqual(1);
  }
}

async function expectStatusBarInRightSidebar(
  page: Parameters<typeof test>[0]["page"],
  statusBar: Locator,
) {
  const rightPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
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
  await page.locator('[data-sidebar-layout-part="carousel"]').evaluate((element) => {
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
        const rightPane = document.querySelector(
          '[data-sidebar-layout-part="pane"][data-pane-side="right"]',
        );
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

test("public landing renders the routed landing UI directly", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const landingArticle = page.getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID);
  await expect(landingArticle).toBeVisible();
  await expect(
    landingArticle.getByRole("heading", {
      level: 1,
      name: "The correct way to build web apps.",
    }),
  ).toBeVisible();
  const accountSection = page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
  await expect(accountSection).toBeVisible();
  await expect(
    accountSection.getByText("Sign in or create an account", { exact: true }),
  ).toBeVisible();
  await expect(accountSection.locator("[aria-expanded]")).toHaveCount(0);
  await expect(accountSection.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await expect(accountSection.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();

  await expect(
    page.locator('[data-sidebar-layout-part="pane"][data-pane-side="left"]'),
  ).toHaveCount(1);
  const rightPane = page.locator('[data-sidebar-layout-part="pane"][data-pane-side="right"]');
  await expect(rightPane).toBeVisible();
  const statusBar = rightPane.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  await expect(statusBar.getByRole("link", { name: "/terms", exact: true })).toBeVisible();
  await expect(statusBar.getByRole("link", { name: "/privacy", exact: true })).toBeVisible();
  await expect(statusBar.getByRole("link", { name: "/pricing", exact: true })).toBeVisible();
  await expect(statusBar.getByRole("link", { name: "/landing", exact: true })).toBeVisible();
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

test("mcp consent sign-in keeps legal links in the sidebar rail", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    "/oauth/mcp/consent?mcp_consent_request=mcpar_test&mcp_login_required=1&signup=google",
    {
      waitUntil: "networkidle",
    },
  );

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);

  await expect(
    page.locator('[data-sidebar-layout-part="pane"][data-pane-side="left"]'),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Toggle Left Sidebar" })).toHaveCount(0);
  await expectLegalLinksUseRightSidebarInnerEdge(statusBar);
  await expectStatusBarInRightSidebar(page, statusBar);
  await expect(statusBar.getByRole("link", { name: "/repo" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();
  await expect(page.getByText("Use the account sidebar to sign in")).toBeVisible();
  await expect(
    page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID).getByRole("button", {
      name: "Continue with Google",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID).getByRole("button", {
      name: "Continue with GitHub",
    }),
  ).toBeVisible();
  await expect(page.locator('[data-sidebar-layout-part="carousel"]')).toHaveScreenshot(
    "mcp-consent-sign-in-no-left-sidebar.png",
    {
      ...strictScreenshotOptions,
      mask: [page.getByTestId(APP_BUILD_VERSION_TEST_ID).locator("xpath=..")],
      maskColor: "#ffffff",
    },
  );
});

test("build identity does not link to the private source repository", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const statusBar = page.getByTestId(APP_BUILD_STATUS_BAR_TEST_ID);
  const version = page.getByTestId(APP_BUILD_VERSION_TEST_ID);
  const commit = page.getByTestId(APP_BUILD_COMMIT_TEST_ID);
  await expectAppBuildVersionDisplay(statusBar, version, commit);
  expect(await commit.getAttribute("href")).toBeNull();
  expect(await commit.evaluate((element) => element.tagName)).toBe("SPAN");
});

test.describe("iPhone SE landing sidebar", () => {
  test.use(iphoneSeLandingDevice);

  test("keeps mobile pane dimensions exact while sliding to the right sidebar", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });

    const beforeSlideMetrics = await readLandingRightSidebarCopyMetrics(page);

    await page.locator('[data-sidebar-layout-part="carousel"]').evaluate((element) => {
      // The regression happened when pane ownership changed mid-gesture.
      const rightPane = document.querySelector(
        '[data-sidebar-layout-part="pane"][data-pane-side="right"]',
      );
      if (!(rightPane instanceof HTMLElement)) {
        throw new Error("Expected landing right pane");
      }

      element.style.scrollSnapType = "none";
      element.scrollLeft +=
        rightPane.getBoundingClientRect().right - element.getBoundingClientRect().right;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    await expect(page.locator('[data-sidebar-layout-part="viewport"]')).toHaveAttribute(
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
    expect(afterSlideMetrics.articleWidth).toBe(beforeSlideMetrics.articleWidth);
    expect(afterSlideMetrics.headingHeight).toBe(beforeSlideMetrics.headingHeight);

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

    await openMobileRightSidebar(page);
    await expectBuildVersionFitsVisibleViewport(page);

    await page.reload({ waitUntil: "networkidle" });
    await expectBuildVersionFitsVisibleViewport(page);
  });
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
});
