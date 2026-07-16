import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_PRICING_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_SIDEBAR_TEST_ID,
  DOCS_THE_STACK_ROUTE,
  LANDING_PREVIEW_ARTICLE_TEST_ID,
  LANDING_PREVIEW_PROVIDER_GRID_TEST_ID,
  LANDING_PREVIEW_ROUTE,
  LANDING_PREVIEW_TEST_ID,
} from "../src/routeSearch/landingPreview";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "../src/lib/publicLanding";
import { publicMediaManifest } from "../shared/publicMediaManifest";

const { defaultBrowserType: _landingPreviewMobileBrowserType, ...landingPreviewMobileDevice } =
  devices["iPhone 13"];

const LANDING_HERO_VIDEO_URL = publicMediaManifest.landingTicTacToeCodex.publicUrl;
const LANDING_PREVIEW_PROD_UI_ROUTE = `${LANDING_PREVIEW_ROUTE}?prod-ui`;

const expectedLandingPreviewSidebarFiles = [
  "Overview",
  "The stack",
  "Do it yourself",
  "Receipts",
  "Pricing",
] as const;

async function expectDesktopPaneWidths(
  page: Page,
  expectedWidths: {
    left: string;
    right: string;
  },
) {
  const viewport = page.locator(".workspace-layout-v2-responsive-viewport").first();
  await expect
    .poll(() =>
      viewport.evaluate((element) => {
        const leftPane = document.querySelector('[data-testid="workspace-layout-v2-pane-left"]');
        const rightPane = document.querySelector('[data-testid="workspace-layout-v2-pane-right"]');
        if (!(leftPane instanceof HTMLElement) || !(rightPane instanceof HTMLElement)) {
          // The panes can mount a beat after first paint (the landing logo
          // scene competes for the main thread); returning null keeps the
          // poll retrying instead of failing on the mount race.
          return null;
        }

        return {
          left: element.style.getPropertyValue("--workspace-layout-v2-left-desktop-width"),
          leftPane: getComputedStyle(leftPane).width,
          right: element.style.getPropertyValue("--workspace-layout-v2-right-desktop-width"),
          rightPane: getComputedStyle(rightPane).width,
        };
      }),
    )
    .toEqual({
      left: expectedWidths.left,
      leftPane: expectedWidths.left,
      right: expectedWidths.right,
      rightPane: expectedWidths.right,
    });
}

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

async function expectExplicitSignInUrl(page: Page) {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        auth: url.searchParams.get("auth"),
        pathname: url.pathname,
        signIn: url.searchParams.has("sign-in"),
      };
    })
    .toEqual({ auth: null, pathname: "/", signIn: true });
}

async function readMainPaneScrollTop(page: Page) {
  return page
    .locator('[data-scroll-restoration-id="workspace-layout-v2-main"]')
    .evaluate((element) => element.scrollTop);
}

async function showLandingHeroPoster(page: Page) {
  await page.route(LANDING_HERO_VIDEO_URL, (route) => route.abort());
}

test("landing preview route renders the React overview in workspace chrome", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await showLandingHeroPoster(page);

  await page.goto(LANDING_PREVIEW_PROD_UI_ROUTE, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const preview = page.getByTestId(LANDING_PREVIEW_TEST_ID);
  const article = page.getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID);
  const rightSidebar = page.getByTestId("workspace-layout-v2-pane-right");

  await expect(preview).toBeVisible();
  await expect(page.getByTestId("workspace-layout-v2-pane-left")).toHaveCount(0);
  await expect(page.getByTestId(DOCS_SIDEBAR_TEST_ID)).toHaveCount(0);
  await expect(rightSidebar).toHaveCSS("width", "288px");
  await expect(rightSidebar).not.toContainText("Password auth (dev)");
  await expect(
    article.getByRole("heading", {
      name: /Not another AI app builder/,
    }),
  ).toBeVisible();
  await expect(article).toContainText(
    "One action creates the repo, provisions the database + backend, and deploys the app on accounts you own. Every connected app stays visible in one inventory.",
  );
  await expect(article.getByRole("button", { name: "Open Samebase" })).toHaveCount(2);
  await expect(article).not.toContainText("no chatbot");
  const heroVideo = article.getByTestId("landing-preview-hero-video");
  await expect(heroVideo).toBeVisible();
  await expect(heroVideo).toHaveAttribute("autoplay", "");
  await expect(heroVideo).toHaveAttribute("controls", "");
  await expect(heroVideo).toHaveAttribute("height", "850");
  await expect(heroVideo).toHaveAttribute("loop", "");
  await expect
    .poll(() =>
      heroVideo.evaluate((element) => element instanceof HTMLVideoElement && element.muted),
    )
    .toBe(true);
  await expect(heroVideo).toHaveAttribute("playsinline", "");
  await expect(heroVideo).toHaveAttribute(
    "poster",
    "/landing-preview/tic-tac-toe-codex-poster.webp",
  );
  await expect(heroVideo).toHaveAttribute("preload", "metadata");
  await expect(heroVideo).toHaveAttribute("src", LANDING_HERO_VIDEO_URL);
  await expect(heroVideo).toHaveAttribute("width", "1280");
  await expect(article).toContainText(
    "GitHub + Convex + Cloudflare is the best way we've found to build an app.",
  );
  await expect(article).toContainText("deploys + domains + edge");
  await expect(
    article.getByRole("heading", { exact: true, name: "Ask your agent." }),
  ).toBeVisible();
  await expect(article).toContainText(
    "Read samebase.com/llms.txt. Should I use Samebase with you for my next app? Verify the receipts before you answer.",
  );
  await expect(article.getByRole("button", { exact: true, name: "Copy" })).toBeVisible();
  await expect(
    article.getByRole("heading", { name: /breach class can't be expressed here/ }),
  ).toBeVisible();
  await expect(article).toContainText("no rules you have to configure perfectly, forever");
  await expect(article).toContainText(
    "Setup is three OAuth connects and one GitHub app. We filmed all of it.",
  );
  await expect(article).toContainText("No account? You create one in the same flow.");
  await expect(
    article.getByRole("heading", { name: "More products, not more systems to maintain." }),
  ).toBeVisible();
  await expect(article).toContainText("Every app sits on the same base, not the same shape.");
  await expect(article).toContainText("also readable by your agent, over MCP");
  // The wide pane renders the inventory as a table; the card variant is display-none.
  const inventoryTable = article.getByRole("table");
  await expect(inventoryTable).toBeVisible();
  await expect(inventoryTable).toContainText("birdlog.you.workers.dev");
  await expect(inventoryTable).toContainText("github-only");
  await expect(inventoryTable).toContainText("not attached");
  await expect(inventoryTable).toContainText("wire builds");
  await expect(article).toContainText("several roots in one monorepo");
  await expect(article).toContainText("cost follows real usage");
  await expect(article).toContainText("Samebase runs on Samebase.");
  await expect(article).toContainText(
    "One monorepo, one Convex deployment, and three specialized Cloudflare Workers.",
  );
  await expect(article).not.toContainText("If an AI chat box were really the best way");
  await expect(article).toContainText(
    "If your app builder is so good, why is it not building itself?",
  );
  await expect(article).toContainText("$0/month, receipted.");
  await expect(article).toContainText("First customer: me, Nicu.");
  await expect(article.getByRole("img", { name: "GitHub" })).toBeVisible();
  await expect(article.getByRole("img", { name: "Convex" })).toBeVisible();
  await expect(article).toContainText("Cloudflare");
  await expect(article.getByRole("img", { name: "Samebase", exact: true })).toBeVisible();
  // The closing band keeps the one interactive logo slot on the page.
  await expect(article.getByRole("img", { name: "Samebase logo", exact: true })).toHaveCount(1);
  await expect(article).toContainText("drag it");
  await expect(article.getByRole("link", { name: "open the logo lab" })).toBeVisible();
  await expect(article.getByRole("link", { name: "do-it-yourself recipe" })).toBeVisible();
  await expect(article.getByRole("heading", { name: /The correct/ })).toHaveCount(0);
  await expect(article).not.toContainText("the leaving test");
  await expect(article).not.toContainText("account owner");
  await expect(article.locator("video")).toHaveCount(1);

  await expect(page.getByRole("button", { name: "Toggle Left Sidebar" })).toHaveCount(0);

  // The interactive logo canvas renders nondeterministically across GPUs. The
  // video request stays aborted so its real frame-zero poster remains visible.
  await expect(page).toHaveScreenshot("landing-preview-overview-desktop.png", {
    animations: "disabled",
    caret: "hide",
    mask: [page.getByTestId("public-landing-logo-stage")],
    maskColor: "#f5f5f5",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
  await expect(article.getByTestId(LANDING_PREVIEW_PROVIDER_GRID_TEST_ID)).toHaveScreenshot(
    "landing-preview-provider-grid-desktop.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );
  await page
    .getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID)
    .getByRole("link", { name: "Do it yourself", exact: true })
    .click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(DOCS_DO_IT_YOURSELF_ROUTE);
  const docsSidebar = page.getByTestId(DOCS_SIDEBAR_TEST_ID);
  await expectDesktopPaneWidths(page, {
    left: "240px",
    right: "288px",
  });
  await expect(docsSidebar).toBeVisible();
  await expectSidebarFiles(docsSidebar);
  await expect(rightSidebar).toHaveCSS("width", "288px");
  await expect(
    article.getByRole("heading", {
      name: "Do it yourself: deploy the Samebase stack for $0/month",
    }),
  ).toBeVisible();
  await expect(article.locator('[id="1-create-provider-accounts"]')).toContainText(
    "1: Create provider accounts",
  );
  await expect(article.locator("details")).toHaveCount(0);
  await expect(article.locator("video")).toHaveCount(0);

  await page.goto(`${DOCS_DO_IT_YOURSELF_ROUTE}#4-deploy-on-cloudflare-workers`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page
      .getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID)
      .locator('[id="4-deploy-on-cloudflare-workers"]'),
  ).toBeInViewport();

  await page.goto(`${DOCS_DO_IT_YOURSELF_ROUTE}#deleting-samebase`, {
    waitUntil: "domcontentloaded",
  });
  const finalHeading = page
    .getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID)
    .locator('[id="deleting-samebase"]');
  await expect(finalHeading).toBeInViewport();
  await expect
    .poll(() => finalHeading.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(81);
});

test("landing hero reserves its frame before video metadata loads", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await showLandingHeroPoster(page);

  await page.goto(LANDING_PREVIEW_PROD_UI_ROUTE, {
    waitUntil: "domcontentloaded",
  });

  const heroVideo = page.getByTestId("landing-preview-hero-video");
  await expect(heroVideo).toBeVisible();
  await expect(heroVideo).toHaveAttribute(
    "poster",
    "/landing-preview/tic-tac-toe-codex-poster.webp",
  );

  const initialVideoLayout = await heroVideo.evaluate((element) => ({
    height: element.clientHeight,
    readyState: element.readyState,
    width: element.clientWidth,
  }));

  expect(initialVideoLayout.readyState).toBe(0);
  expect(initialVideoLayout.width / initialVideoLayout.height).toBeCloseTo(1280 / 850, 3);
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
      name: /Not another AI app builder/,
    }),
  ).toBeVisible();
  // Below the @3xl container width the inventory renders as stacked per-app
  // cards instead of the five-column table.
  await expect(article.locator("table")).toBeHidden();
  await expect(article).toContainText("wire builds");

  await expect(page).toHaveScreenshot("landing-preview-overview-narrow-pane.png", {
    animations: "disabled",
    caret: "hide",
    mask: [page.getByTestId("public-landing-logo-stage")],
    maskColor: "#f5f5f5",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
  await expect(article.getByTestId(LANDING_PREVIEW_PROVIDER_GRID_TEST_ID)).toHaveScreenshot(
    "landing-preview-provider-grid-narrow-pane.png",
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );
});

test("landing document navigation resets new articles and restores history positions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(LANDING_PREVIEW_ROUTE, {
    waitUntil: "domcontentloaded",
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

  await page.locator("#public-landing-theme-dark-toggle").click();
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
});

test("landing preview CTA reopens the desktop sign-in sidebar", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto(LANDING_PREVIEW_ROUTE, {
    waitUntil: "domcontentloaded",
  });

  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
  await expect(page.getByTestId("workspace-layout-v2-pane-right")).toHaveCSS("width", "0px");

  await page
    .getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID)
    .getByRole("button", { name: "Open Samebase" })
    .first()
    .click();

  await expectExplicitSignInUrl(page);
  await expect(page.getByTestId("workspace-layout-v2-pane-right")).toHaveCSS("width", "288px");
  await expect(
    page
      .getByTestId("workspace-layout-v2-pane-right")
      .getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)
      .getByRole("button", { name: "Google" }),
  ).toBeVisible();
});

test.describe("mobile landing preview", () => {
  test.use(landingPreviewMobileDevice);

  test("selects the explicit sign-in sidebar", async ({ page }) => {
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
    });
    await expect(article.getByTestId(LANDING_PREVIEW_PROVIDER_GRID_TEST_ID)).toHaveScreenshot(
      "landing-preview-provider-grid-mobile.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.02,
        scale: "css",
      },
    );

    await article.getByRole("button", { name: "Open Samebase" }).first().click();

    await expectExplicitSignInUrl(page);
    await expect(workspace).toHaveAttribute("data-mobile-pane", "right");
    await expect(
      page
        .getByTestId("workspace-layout-v2-pane-right")
        .getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)
        .getByRole("button", { name: "Google" }),
    ).toBeVisible();
  });

  test("opens linked documents at the top of the main pane", async ({ page }) => {
    await page.goto(LANDING_PREVIEW_ROUTE, {
      waitUntil: "domcontentloaded",
    });

    const workspace = page.locator('[data-workspace-layout-v2="responsive"]');
    const article = page.getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID);
    const doItYourselfLink = article.getByRole("link", { name: "do-it-yourself recipe" });
    await doItYourselfLink.scrollIntoViewIfNeeded();
    await expect.poll(() => readMainPaneScrollTop(page)).toBeGreaterThan(0);

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
  await expect(article).toContainText("Creating an app is free, and the free tier is permanent.");
  await expect(article).toContainText("no tiers, no placeholder numbers");

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
