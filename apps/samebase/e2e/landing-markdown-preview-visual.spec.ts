import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_PRICING_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_SIDEBAR_TEST_ID,
  DOCS_THE_STACK_ROUTE,
  LANDING_PREVIEW_ARTICLE_TEST_ID,
  LANDING_PREVIEW_PLATFORM_DETAILS_TEST_ID,
  LANDING_PREVIEW_ROUTE,
} from "../src/routeSearch/landingPreview";
import { publicMediaManifest } from "../shared/publicMediaManifest";

const { defaultBrowserType: _landingPreviewMobileBrowserType, ...landingPreviewMobileDevice } =
  devices["iPhone 13"];

test.setTimeout(120_000);

const LANDING_HERO_VIDEO_URL = publicMediaManifest.landingFounderDemo.publicUrl;
const LANDING_PREVIEW_PROD_UI_ROUTE = `${LANDING_PREVIEW_ROUTE}?prod-ui`;

const expectedLandingPreviewSidebarFiles = [
  "Overview",
  "The stack",
  "Do it yourself",
  "Receipts",
  "Pricing",
] as const;

async function expectSidebarFiles(sidebar: Locator) {
  const sidebarLinks = sidebar.getByRole("link");
  await expect(sidebarLinks).toHaveCount(expectedLandingPreviewSidebarFiles.length);
  for (const fileLabel of expectedLandingPreviewSidebarFiles) {
    await expect(sidebar.getByText(fileLabel, { exact: true })).toBeVisible();
  }
  // Sidebar links retain unrelated query params such as ?dark, so hrefs match
  // the route with an optional search suffix.
  await expect(sidebar.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "href",
    new RegExp(`^${LANDING_PREVIEW_ROUTE}(\\?|$)`),
  );
  await expect(sidebar.getByRole("link", { name: "Do it yourself" })).toHaveAttribute(
    "href",
    new RegExp(`^${DOCS_DO_IT_YOURSELF_ROUTE}(\\?|$)`),
  );
  await expect(sidebar.getByRole("link", { name: "Receipts" })).toHaveAttribute(
    "href",
    new RegExp(`^${DOCS_RECEIPTS_ROUTE}(\\?|$)`),
  );
  await expect(sidebar.getByRole("link", { name: "Pricing" })).toHaveAttribute(
    "href",
    new RegExp(`^${DOCS_PRICING_ROUTE}(\\?|$)`),
  );
  await expect(sidebar).not.toContainText("Start here");
  await expect(sidebar).not.toContainText("samebase.com");
}

async function readMainPaneScrollTop(page: Page) {
  return page
    .locator('[data-scroll-restoration-id="workspace-layout-v2-main"]')
    .evaluate((element) => element.scrollTop);
}

async function showLandingHeroPoster(page: Page) {
  await page.route(LANDING_HERO_VIDEO_URL, (route) => route.abort());
}

test("landing overview preserves its unloaded video frame and wide desktop layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await showLandingHeroPoster(page);

  await page.goto(LANDING_PREVIEW_PROD_UI_ROUTE, {
    waitUntil: "domcontentloaded",
  });

  const heroVideo = page.getByTestId("landing-preview-hero-video");
  await expect(heroVideo).toBeVisible();
  const initialVideoLayout = await heroVideo.evaluate((element) => ({
    height: element.clientHeight,
    readyState: element.readyState,
    width: element.clientWidth,
  }));
  expect(initialVideoLayout.readyState).toBe(0);
  expect(initialVideoLayout.width / initialVideoLayout.height).toBeCloseTo(1440 / 930, 2);

  await page.waitForLoadState("networkidle");

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const article = page.getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID);
  const platformDetails = article.getByTestId(LANDING_PREVIEW_PLATFORM_DETAILS_TEST_ID);

  // The interactive logo canvases render nondeterministically across GPUs. The
  // video request stays aborted so its real frame-zero poster remains visible.
  await expect(page).toHaveScreenshot("landing-preview-overview-desktop.png", {
    animations: "disabled",
    caret: "hide",
    mask: [
      page.getByTestId("landing-preview-hero-menger"),
      page.getByTestId("public-landing-logo-stage"),
    ],
    maskColor: "#f5f5f5",
    maxDiffPixelRatio: 0.02,
    scale: "css",
    timeout: 30_000,
  });
  await expect(platformDetails).toHaveScreenshot("landing-preview-platform-desktop.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
    timeout: 30_000,
  });
});

test("landing preview FAQ answers the direct-agent questions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await showLandingHeroPoster(page);
  await page.goto(LANDING_PREVIEW_PROD_UI_ROUTE, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const faq = page
    .getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID)
    .getByRole("region", { name: "Frequently asked questions" });
  await expect(faq).toContainText("Codex already writes Convex well. Why do I need Samebase?");
  await expect(faq).toContainText("Ok, but can't I just get your template and not use Samebase?");
  await expect(faq).toContainText(
    "I can just ask Codex to update my own apps. Why do I need Samebase?",
  );
  await expect(faq).toContainText("Wait, so all Samebase is, is a template and a list?");

  const firstQuestion = faq.getByRole("button", {
    name: "Codex already writes Convex well. Why do I need Samebase?",
  });
  const secondQuestion = faq.getByRole("button", {
    name: "Ok, but can't I just get your template and not use Samebase?",
  });
  const firstAnswer = faq.getByText("You do not need Samebase to make Codex write Convex.", {
    exact: false,
  });
  const secondAnswer = faq.getByText("You can. The template and skills are public.", {
    exact: false,
  });

  await expect(firstQuestion).toHaveAttribute("aria-expanded", "false");
  await expect(firstAnswer).toBeHidden();
  await firstQuestion.click();
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "true");
  await expect(firstAnswer).toBeVisible();
  await expect(faq).toHaveScreenshot("landing-preview-faq-desktop.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
    timeout: 30_000,
  });

  await firstQuestion.focus();
  await firstQuestion.press("ArrowDown");
  await expect(secondQuestion).toBeFocused();
  await secondQuestion.press("Enter");
  await expect(secondQuestion).toHaveAttribute("aria-expanded", "true");
  await expect(secondAnswer).toBeVisible();
  await expect(firstQuestion).toHaveAttribute("aria-expanded", "false");
  await expect(firstAnswer).toBeHidden();
});

test("landing preview FAQ stays responsive while the closing logo is off screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await showLandingHeroPoster(page);
  await page.goto(LANDING_PREVIEW_PROD_UI_ROUTE, {
    waitUntil: "domcontentloaded",
  });

  const article = page.getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID);
  const faq = article.getByRole("region", { name: "Frequently asked questions" });
  await faq.scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(1_500);

  await expect(article.getByTestId("public-landing-logo-stage")).not.toBeInViewport();

  const devtools = await page.context().newCDPSession(page);
  await devtools.send("Performance.enable");
  await devtools.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const readScriptDuration = async () => {
    const { metrics } = await devtools.send("Performance.getMetrics");
    const scriptDuration = metrics.find((metric) => metric.name === "ScriptDuration");
    if (!scriptDuration) {
      throw new Error("Chromium did not report ScriptDuration.");
    }
    return scriptDuration.value;
  };

  const scriptDurationBefore = await readScriptDuration();
  await faq
    .getByRole("button", {
      name: "Codex already writes Convex well. Why do I need Samebase?",
    })
    .click();
  await page.waitForTimeout(450);
  const scriptDurationAfter = await readScriptDuration();

  expect((scriptDurationAfter - scriptDurationBefore) * 1_000).toBeLessThan(150);
});

test("landing preview overview adapts to a narrow pane", async ({ page }) => {
  // A tablet-width viewport leaves the pane beside the right sidebar narrower
  // than the viewport md breakpoint. The overview must render its stacked
  // container layout instead of forcing the two-column hero grid.
  await page.setViewportSize({ width: 800, height: 900 });
  await showLandingHeroPoster(page);

  await page.goto(LANDING_PREVIEW_PROD_UI_ROUTE, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const article = page.getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID);
  await expect(
    article.getByRole("heading", {
      name: /The correct way to build web apps/,
    }),
  ).toBeVisible();
  const monorepo = article.getByRole("region", { name: "Monorepo" });
  await expect(monorepo).toContainText("apps/storefront");
  await expect(monorepo).toContainText("Convex + Worker");
  await expect(page.getByTestId("landing-preview-hero-menger")).toBeHidden();
  await expect(page.getByTestId("logo-menger-hover-scene")).toHaveCount(0);

  await expect(page).toHaveScreenshot("landing-preview-overview-narrow-pane.png", {
    animations: "disabled",
    caret: "hide",
    mask: [page.getByTestId("public-landing-logo-stage")],
    maskColor: "#f5f5f5",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
  await expect(monorepo).toHaveScreenshot("landing-preview-monorepo-narrow-pane.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
    timeout: 30_000,
  });
  await expect(article.getByTestId(LANDING_PREVIEW_PLATFORM_DETAILS_TEST_ID)).toHaveScreenshot(
    "landing-preview-platform-narrow-pane.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
      timeout: 30_000,
    },
  );
});

test("landing document navigation resets pages, restores history, and aligns direct anchors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  // This route-history test does not need the GPU scenes that have separate coverage.
  await page.addInitScript(() => {
    const originalGetContext = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "getContext",
    )?.value;
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
  await showLandingHeroPoster(page);
  await page.goto(LANDING_PREVIEW_ROUTE, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const article = page.getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID);
  const doItYourselfLink = article.getByRole("link", { name: "do-it-yourself recipe" });
  await doItYourselfLink.scrollIntoViewIfNeeded();
  await expect.poll(() => readMainPaneScrollTop(page)).toBeGreaterThan(0);
  const overviewScrollTop = await readMainPaneScrollTop(page);

  await doItYourselfLink.click();

  await expect(page).toHaveURL(new RegExp(`${DOCS_DO_IT_YOURSELF_ROUTE}$`));
  await expect.poll(() => readMainPaneScrollTop(page)).toBe(0);
  await expect(
    article.getByRole("heading", {
      name: "Do it yourself: deploy the Samebase stack for $0/month",
    }),
  ).toBeInViewport();

  await article.locator('[id="deleting-samebase"]').scrollIntoViewIfNeeded();
  await expect.poll(() => readMainPaneScrollTop(page)).toBeGreaterThan(0);
  const doItYourselfScrollTop = await readMainPaneScrollTop(page);

  await page
    .getByTestId(DOCS_SIDEBAR_TEST_ID)
    .getByRole("link", { exact: true, name: "The stack" })
    .click();

  await expect(page).toHaveURL(new RegExp(`${DOCS_THE_STACK_ROUTE}$`));
  await expect.poll(() => readMainPaneScrollTop(page)).toBe(0);
  await expect(article.getByRole("heading", { exact: true, name: "The stack" })).toBeInViewport();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${DOCS_DO_IT_YOURSELF_ROUTE}$`));
  await expect.poll(() => readMainPaneScrollTop(page)).toBe(doItYourselfScrollTop);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${LANDING_PREVIEW_ROUTE}$`));
  await expect.poll(() => readMainPaneScrollTop(page)).toBe(overviewScrollTop);

  await page.getByRole("link", { exact: true, name: "/terms" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/terms");
  await expect.poll(() => readMainPaneScrollTop(page)).toBe(0);
  await expect(
    page.getByRole("heading", { exact: true, name: "Terms of Service" }),
  ).toBeInViewport();

  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(LANDING_PREVIEW_ROUTE);
  await expect.poll(() => readMainPaneScrollTop(page)).toBe(overviewScrollTop);

  await page.goto(`${DOCS_DO_IT_YOURSELF_ROUTE}#deleting-samebase`, {
    waitUntil: "domcontentloaded",
  });
  const finalHeading = article.locator('[id="deleting-samebase"]');
  await expect(finalHeading).toBeInViewport();
  await expect
    .poll(() => finalHeading.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(81);
});

test.describe("mobile landing preview", () => {
  test.use(landingPreviewMobileDevice);

  test("renders the mobile overview", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 390 });
    await showLandingHeroPoster(page);
    await page.goto(LANDING_PREVIEW_PROD_UI_ROUTE, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const workspace = page.locator('[data-workspace-layout-v2="responsive"]');
    const article = page.getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID);
    const heroVideo = article.getByTestId("landing-preview-hero-video");
    await expect(workspace).toHaveAttribute("data-mobile-pane", "main");
    await expect(heroVideo).toBeVisible();
    await expect(page).toHaveScreenshot("landing-preview-hero-mobile.png", {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
      timeout: 30_000,
    });
    await expect(article.getByTestId(LANDING_PREVIEW_PLATFORM_DETAILS_TEST_ID)).toHaveScreenshot(
      "landing-preview-platform-mobile.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.02,
        scale: "css",
        timeout: 30_000,
      },
    );
  });

  test("renders the FAQ for a mobile pane", async ({ page }) => {
    await page.setViewportSize({ height: 1200, width: 390 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await showLandingHeroPoster(page);
    await page.goto(LANDING_PREVIEW_PROD_UI_ROUTE, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const faq = page
      .getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID)
      .getByRole("region", { name: "Frequently asked questions" });
    await expect(faq).toContainText("Codex already writes Convex well. Why do I need Samebase?");
    await expect(faq).toContainText("Ok, but can't I just get your template and not use Samebase?");
    await expect(faq).toContainText(
      "I can just ask Codex to update my own apps. Why do I need Samebase?",
    );
    await expect(faq).toContainText("Wait, so all Samebase is, is a template and a list?");
    const thirdQuestion = faq.getByRole("button", {
      name: "I can just ask Codex to update my own apps. Why do I need Samebase?",
    });
    await expect(thirdQuestion).toHaveAttribute("aria-expanded", "false");
    await thirdQuestion.click();
    await expect(thirdQuestion).toHaveAttribute("aria-expanded", "true");
    await expect(
      faq.getByText("The bet is that you will build tens of apps.", { exact: false }),
    ).toBeVisible();
    const fourthQuestion = faq.getByRole("button", {
      name: "Wait, so all Samebase is, is a template and a list?",
    });
    await fourthQuestion.click();
    await expect(fourthQuestion).toHaveAttribute("aria-expanded", "true");
    await expect(thirdQuestion).toHaveAttribute("aria-expanded", "false");
    await expect(faq.getByText("Kinda.", { exact: true })).toBeVisible();
    await expect(faq).toHaveScreenshot("landing-preview-faq-mobile.png", {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
      timeout: 30_000,
    });
  });

  test("opens linked documents at the top of the main pane", async ({ page }) => {
    await page.goto(LANDING_PREVIEW_ROUTE, {
      waitUntil: "domcontentloaded",
    });

    const workspace = page.locator('[data-workspace-layout-v2="responsive"]');
    const article = page.getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID);
    const doItYourselfLink = article.getByRole("link", { name: "do-it-yourself recipe" });
    await expect(doItYourselfLink).toBeVisible();
    const mainPaneScroller = page.locator(
      '[data-scroll-restoration-id="workspace-layout-v2-main"]',
    );
    await expect
      .poll(() =>
        mainPaneScroller.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
          return element.scrollTop;
        }),
      )
      .toBeGreaterThan(0);

    await doItYourselfLink.click();

    await expect(page).toHaveURL(new RegExp(`${DOCS_DO_IT_YOURSELF_ROUTE}$`));
    await expect(workspace).toHaveAttribute("data-mobile-pane", "main");
    await expect.poll(() => readMainPaneScrollTop(page)).toBe(0);
    await expect(
      article.getByRole("heading", {
        name: "Do it yourself: deploy the Samebase stack for $0/month",
      }),
    ).toBeInViewport();
  });
});

test("docs receipts route renders the claims ledger", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(DOCS_RECEIPTS_ROUTE, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const article = page.getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID);
  const sidebar = page.getByTestId(DOCS_SIDEBAR_TEST_ID);

  await expect(sidebar).toBeVisible();
  await expectSidebarFiles(sidebar);
  await expect(article.getByRole("heading", { exact: true, name: "Receipts" })).toBeVisible();
  await expect(article).toContainText("Requests to static assets are free and unlimited.");
  await expect(article).toContainText("security researcher Matt Palmer");
  await expect(article).toContainText("Last full check: 2026-07-02");
  await expect(article).toContainText("deleted, not softened");
  await expect(article.locator("video")).toHaveCount(0);

  await expect(page).toHaveScreenshot("docs-receipts-desktop.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("pricing route renders the public pricing page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(DOCS_PRICING_ROUTE, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const article = page.getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID);
  const sidebar = page.getByTestId(DOCS_SIDEBAR_TEST_ID);

  await expect(sidebar).toBeVisible();
  await expectSidebarFiles(sidebar);
  await expect(article.getByRole("heading", { exact: true, name: "Pricing" })).toBeVisible();
  await expect(article).toContainText("Start free. Upgrade when you need more connections.");
  await expect(article.getByRole("row", { name: "Personal account Free $0 15 1" })).toBeVisible();
  await expect(article.getByRole("row", { name: "GitHub organization Free $0 6 2" })).toBeVisible();
  await expect(article.getByRole("row", { name: "Any owner Pro $4 120 2" })).toBeVisible();
  await expect(article).toContainText(
    "Members above the included limit require Pro and an available seat.",
  );
  await expect(article).not.toContainText("FileView");

  await expect(page).toHaveScreenshot("docs-pricing-desktop.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});

test("landing do-it-yourself mobile pane query opens the flat sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 744, height: 1200 });
  await page.goto(`${DOCS_DO_IT_YOURSELF_ROUTE}?left&dark`, {
    waitUntil: "domcontentloaded",
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const sidebar = page.getByTestId(DOCS_SIDEBAR_TEST_ID);
  await expect(sidebar).toBeVisible();
  await expectSidebarFiles(sidebar);
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        dark: url.searchParams.has("dark"),
        left: url.searchParams.has("left"),
      };
    })
    .toEqual({
      dark: true,
      left: true,
    });
  await expect(page).toHaveScreenshot("landing-markdown-preview-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
});
