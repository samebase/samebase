import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_SIDEBAR_TEST_ID,
  LANDING_PREVIEW_ARTICLE_TEST_ID,
  LANDING_PREVIEW_ROUTE,
  LANDING_PREVIEW_TEST_ID,
} from "../src/routeSearch/landingPreview";

const expectedLandingPreviewSidebarFiles = [
  "Overview",
  "The stack",
  "Do it yourself",
  "Receipts",
] as const;
const expectedLandingPreviewVideoSrcs = [
  "/landing-preview/step-1-create-accounts.mp4",
  "/landing-preview/step-2-use-template.mp4",
  "/landing-preview/step-3-connect-cloudflare-pages.mp4",
  "/landing-preview/step-4-create-convex-project.mp4",
  "/landing-preview/step-5-create-cloudflare-pages-deploy.mp4",
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
  await expect(sidebar).not.toContainText("Start here");
  await expect(sidebar).not.toContainText("samebase.com");
}

async function hideLandingPreviewVideosForScreenshot(page: Page) {
  // Linux browser images do not all decode the MP4 assets, so visual coverage
  // keeps video layout in place while leaving frame rendering to src assertions.
  await page.addStyleTag({
    content: `
      video[src^="/landing-preview/"] {
        visibility: hidden !important;
      }
    `,
  });
}

test("landing preview route renders the React overview in workspace chrome", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(LANDING_PREVIEW_ROUTE, {
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
  // The hero footnote link labels itself "footnote: correct", so the h1
  // accessible name reads "The correct footnote: correct way to build web apps".
  await expect(
    article.getByRole("heading", {
      name: /The correct.*way to build web apps/,
    }),
  ).toBeVisible();
  await expect(
    article.getByRole("heading", {
      exact: true,
      name: "correct",
    }),
  ).toBeVisible();
  await expect(article).toContainText("cheaper and more powerful");
  await expect(article).toContainText("cost follows real usage");
  await expect(article).toContainText("dash.cloudflare.com");
  await expect(article).not.toContainText("samebase hides");
  await expect(article).toContainText(
    "If your app builder is so good, why is it not building itself?",
  );
  await expect(article).toContainText("samebase.com uses the exact same stack it recommends");
  await expect(article).toContainText("the first customer was me, Nicu");
  await expect(article).toContainText("personal and idle ideas should cost $0/month");
  await expect(article.getByRole("img", { name: "GitHub" })).toBeVisible();
  await expect(article.getByRole("img", { name: "Convex" })).toBeVisible();
  await expect(article).toContainText("Cloudflare");
  await expect(article.getByRole("img", { name: "Samebase", exact: true })).toBeVisible();
  // One interactive logo beside the hero, four zone rail marks, one closing band.
  await expect(article.getByRole("img", { name: "Samebase logo", exact: true })).toHaveCount(6);
  await expect(article).toContainText("drag it");
  await expect(article.getByRole("link", { name: "open the logo lab" })).toBeVisible();
  await expect(article.getByRole("heading", { name: "The base is a trio." })).toHaveCount(0);
  await expect(article.getByRole("heading", { name: "Manual setup proves it" })).toHaveCount(0);
  await expect(article.getByRole("link", { name: "Start with Samebase" })).toHaveCount(0);
  await expect(article.getByRole("link", { name: "Do it yourself" })).toHaveCount(3);
  await expect(article.getByRole("img", { name: "OpenAI" })).toHaveCount(0);
  await expect(
    article.locator('[id="1-create-github-convex-cloudflare-openai-accounts"]'),
  ).toHaveCount(0);
  await expect(article.locator("video")).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Toggle Left Sidebar" })).toHaveCount(0);

  // The interactive logo canvases render nondeterministically across GPUs, so
  // the overview baseline masks their stages and covers layout and typography.
  await expect(page).toHaveScreenshot("landing-preview-overview-desktop.png", {
    animations: "disabled",
    caret: "hide",
    mask: [page.getByTestId("public-landing-logo-stage")],
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });
  await page
    .getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID)
    .getByRole("link", { name: "Do it yourself", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${DOCS_DO_IT_YOURSELF_ROUTE}$`));
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
      name: "Do it yourself: Deploy a production-ready, real-time web app for $0/month",
    }),
  ).toBeVisible();
  await expect(
    article.locator('[id="1-create-github-convex-and-cloudflare-accounts"]'),
  ).toContainText("1: Create Github, Convex, and Cloudflare accounts");
  await expect(article.locator("details")).toHaveCount(3);
  await expect(article.locator("details video")).toHaveCount(0);
  const videos = article.locator("video");
  await expect(videos).toHaveCount(expectedLandingPreviewVideoSrcs.length);
  for (const [index, expectedVideoSrc] of expectedLandingPreviewVideoSrcs.entries()) {
    const video = videos.nth(index);
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("src", expectedVideoSrc);
  }

  const firstTaskCheckbox = article.locator('input[type="checkbox"]').first();
  await expect(firstTaskCheckbox).toBeEnabled();
  await firstTaskCheckbox.check();
  await expect(firstTaskCheckbox).toBeChecked();

  await page.goto(`${DOCS_DO_IT_YOURSELF_ROUTE}#6-connect-your-dev-tool-to-github`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page
      .getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID)
      .locator('[id="6-connect-your-dev-tool-to-github"]'),
  ).toBeInViewport();

  await page.goto(`${DOCS_DO_IT_YOURSELF_ROUTE}#why-is-samebase-com-free`, {
    waitUntil: "domcontentloaded",
  });
  const finalHeading = page
    .getByTestId(LANDING_PREVIEW_ARTICLE_TEST_ID)
    .locator('[id="why-is-samebase-com-free"]');
  await expect(finalHeading).toBeInViewport();
  await expect
    .poll(() => finalHeading.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(81);
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

test("landing do-it-yourself mobile pane query opens the flat sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 744, height: 1200 });
  await page.goto(`${DOCS_DO_IT_YOURSELF_ROUTE}?left&dark`, {
    waitUntil: "domcontentloaded",
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const sidebar = page.getByTestId(DOCS_SIDEBAR_TEST_ID);
  const firstVideo = page.locator(`video[src="${expectedLandingPreviewVideoSrcs[0]}"]`);
  await expect(sidebar).toBeVisible();
  await expectSidebarFiles(sidebar);
  await expect(firstVideo).toBeVisible();
  await hideLandingPreviewVideosForScreenshot(page);
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
