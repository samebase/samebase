import { expect, test, type Locator, type Page } from "@playwright/test";
import { APP_BUILD_VERSION_TEST_ID } from "../src/lib/appBuild";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM,
  LANDING_MARKDOWN_PREVIEW_ROUTE,
  LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
} from "../src/routeSearch/landingPreview";
import { buildPathWithTanStackSearch } from "../src/lib/tanstackSearchParams";

const expectedLandingPreviewSidebarFiles = ["Overview", "Build it yourself"] as const;
const expectedLandingPreviewVideoSrcs = [
  "/landing-preview/step-1-create-accounts.mp4",
  "/landing-preview/step-2-use-template.mp4",
  "/landing-preview/step-3-connect-cloudflare-pages.mp4",
  "/landing-preview/step-4-create-convex-project.mp4",
  "/landing-preview/step-5-create-cloudflare-pages-deploy.mp4",
] as const;
const expectedRomanianPreviewHref = buildPathWithTanStackSearch({
  pathname: LANDING_MARKDOWN_PREVIEW_ROUTE,
  search: {
    [LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM]: "ro",
  },
});

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
          throw new Error("Expected workspace side panes.");
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
  await expect(sidebar.getByRole("link")).toHaveCount(0);
  for (const fileLabel of expectedLandingPreviewSidebarFiles) {
    await expect(sidebar.getByText(fileLabel, { exact: true })).toBeVisible();
  }
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

test("landing markdown preview route renders markdown in workspace chrome", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(LANDING_MARKDOWN_PREVIEW_ROUTE, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const preview = page.getByTestId(LANDING_MARKDOWN_PREVIEW_TEST_ID);
  const article = page.getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID);
  const sidebar = page.getByTestId(LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID);
  const rightSidebar = page.getByTestId("workspace-layout-v2-pane-right");

  await expect(preview).toBeVisible();
  await expectDesktopPaneWidths(page, {
    left: "0px",
    right: "0px",
  });
  await expect(
    article.getByRole("heading", {
      name: "The correct✱ way to build web apps",
    }),
  ).toBeVisible();
  await expect(
    article.getByRole("heading", {
      name: "What Samebase is",
    }),
  ).toBeVisible();
  await expect(
    article.getByRole("heading", {
      name: /Build it yourself: Deploy a production-ready, real-time web app/,
    }),
  ).toHaveCount(1);
  await expect(
    article.locator('[id="1-create-github-convex-cloudflare-openai-accounts"]'),
  ).toContainText("1: Create Github, Convex, Cloudflare & OpenAI accounts");
  await expect(
    article.getByRole("link", {
      name: "Română",
    }),
  ).toHaveAttribute("href", expectedRomanianPreviewHref);
  await expect(article.locator("details")).toHaveCount(4);
  await expect(article.locator("details video")).toHaveCount(0);
  const videos = article.locator("video");
  await expect(videos).toHaveCount(expectedLandingPreviewVideoSrcs.length);
  for (const [index, expectedVideoSrc] of expectedLandingPreviewVideoSrcs.entries()) {
    const video = videos.nth(index);
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("src", expectedVideoSrc);
  }
  await hideLandingPreviewVideosForScreenshot(page);

  await expect(page).toHaveScreenshot("landing-markdown-preview-desktop.png", {
    animations: "disabled",
    caret: "hide",
    // The app build footer changes on every squash; keep this snapshot focused
    // on the markdown preview layout and rendered content.
    mask: [page.getByTestId(APP_BUILD_VERSION_TEST_ID).locator("xpath=..")],
    maskColor: "#ffffff",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });

  await page.getByRole("button", { name: "Toggle Left Sidebar" }).click();
  await expectDesktopPaneWidths(page, {
    left: "240px",
    right: "0px",
  });
  await expect(sidebar).toBeVisible();
  await expectSidebarFiles(sidebar);
  await expect(rightSidebar).toHaveCSS("width", "0px");

  const firstTaskCheckbox = article.locator('input[type="checkbox"]').first();
  await expect(firstTaskCheckbox).toBeEnabled();
  await firstTaskCheckbox.check();
  await expect(firstTaskCheckbox).toBeChecked();

  await page.goto("/landing-preview#6-connect-codex-to-github", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page
      .getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID)
      .locator('[id="6-connect-codex-to-github"]'),
  ).toBeInViewport();

  await page.goto("/landing-preview#why-is-samebase-com-free", {
    waitUntil: "domcontentloaded",
  });
  const finalHeading = page
    .getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID)
    .locator('[id="why-is-samebase-com-free"]');
  await expect(finalHeading).toBeInViewport();
  await expect
    .poll(() => finalHeading.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(81);
});

test("landing markdown preview mobile pane query opens the flat sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 744, height: 1200 });
  await page.goto("/landing-preview?left&dark", {
    waitUntil: "domcontentloaded",
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const sidebar = page.getByTestId(LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID);
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
