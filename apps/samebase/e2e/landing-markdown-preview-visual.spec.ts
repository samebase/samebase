import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { APP_BUILD_VERSION_TEST_ID } from "../src/lib/appBuild";
import { LANDING_DEV_MODE_QUERY_PARAM } from "../src/lib/landingDevMode";
import { getLandingMarkdownHeadings } from "../src/lib/landingMarkdownHeadings";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM,
  LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL,
  LANDING_MARKDOWN_PREVIEW_ROUTE,
  LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
} from "../src/routeSearch/landingPreview";
import { buildPathWithTanStackSearch } from "../src/lib/tanstackSearchParams";
import { signInIfNeeded } from "./liveHelpers";

const landingPreviewMarkdown = readFileSync(
  new URL("../src/content/landing-preview.md", import.meta.url),
  "utf8",
);
const expectedLandingPreviewSidebarLinks = getLandingMarkdownHeadings(landingPreviewMarkdown).map(
  (heading) => ({
    href: heading.href,
    text: heading.text,
  }),
);
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
    [LANDING_DEV_MODE_QUERY_PARAM]: true,
    [LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM]: "ro",
  },
});

async function expectSidebarLinksToMatchMarkdown(sidebar: Locator) {
  const sidebarLinks = sidebar.getByRole("link");
  await expect(sidebarLinks).toHaveCount(expectedLandingPreviewSidebarLinks.length);
  await expect(sidebarLinks).toHaveText(
    expectedLandingPreviewSidebarLinks.map((link) => link.text),
  );
  for (const [index, link] of expectedLandingPreviewSidebarLinks.entries()) {
    await expect(sidebarLinks.nth(index)).toHaveAttribute("href", link.href);
  }
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

async function signInForLandingPreviewRoute(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page);
}

test("landing markdown preview route renders markdown in workspace chrome", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInForLandingPreviewRoute(page);

  await page.goto("/landing-preview?dev", {
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
  await expect(sidebar).toBeVisible();
  await expectSidebarLinksToMatchMarkdown(sidebar);
  await expect(rightSidebar).toBeVisible();
  await expect(
    article.getByRole("heading", {
      name: /Deploy a production-ready, real-time web-app/,
    }),
  ).toBeVisible();
  await expect(
    article.locator('[id="1-create-github-convex-cloudflare-openai-accounts"]'),
  ).toContainText("1: Create Github, Convex, Cloudflare & OpenAI accounts");
  await expect(
    page.getByRole("link", {
      name: LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL,
    }),
  ).toHaveAttribute("href", expectedRomanianPreviewHref);
  const markdownRomanianHref = await article
    .getByRole("link", {
      name: "Română",
    })
    .getAttribute("href");
  expect(markdownRomanianHref?.startsWith(LANDING_MARKDOWN_PREVIEW_ROUTE)).toBe(true);
  const markdownRomanianSearch = new URLSearchParams(markdownRomanianHref?.split("?").at(1) ?? "");
  expect(markdownRomanianSearch.get(LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM)).toBe("ro");
  expect(markdownRomanianSearch.has(LANDING_DEV_MODE_QUERY_PARAM)).toBe(true);
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

  await sidebar
    .getByRole("link", {
      name: "4: Create a Convex project and a CONVEX_DEPLOY_KEY",
    })
    .click();
  await expect(page).toHaveURL(/#4-create-a-convex-project-and-a-convex-deploy-key$/);
  await expect(
    article.locator('[id="4-create-a-convex-project-and-a-convex-deploy-key"]'),
  ).toBeInViewport();

  const firstTaskCheckbox = article.locator('input[type="checkbox"]').first();
  await expect(firstTaskCheckbox).toBeEnabled();
  await firstTaskCheckbox.check();
  await expect(firstTaskCheckbox).toBeChecked();

  await page.goto("/landing-preview?dev#6-connect-codex-to-github", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page
      .getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID)
      .locator('[id="6-connect-codex-to-github"]'),
  ).toBeInViewport();

  await page.goto("/landing-preview?dev#why-is-samebase-com-free", {
    waitUntil: "domcontentloaded",
  });
  const finalHeading = page
    .getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID)
    .locator('[id="why-is-samebase-com-free"]');
  await expect(finalHeading).toBeInViewport();
  await expect
    .poll(() => finalHeading.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(80);
});

test("landing markdown preview sidebar hash links keep the mobile sidebar open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 744, height: 1200 });
  await signInForLandingPreviewRoute(page);
  await page.goto(
    "/landing-preview?dev&left&dark#9-create-an-app-in-a-single-step-using-samebase-com",
    {
      waitUntil: "domcontentloaded",
    },
  );

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const sidebar = page.getByTestId(LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID);
  const firstVideo = page.locator(`video[src="${expectedLandingPreviewVideoSrcs[0]}"]`);
  const screenshotHeading = page
    .getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID)
    .locator('[id="9-create-an-app-in-a-single-step-using-samebase-com"]');
  await expect(sidebar).toBeVisible();
  await expectSidebarLinksToMatchMarkdown(sidebar);
  await expect(firstVideo).toBeVisible();
  await expect(screenshotHeading).toBeInViewport();
  await hideLandingPreviewVideosForScreenshot(page);
  await expect(screenshotHeading).toBeInViewport();
  await expect
    .poll(() => screenshotHeading.evaluate((element) => element.getBoundingClientRect().top))
    .toBeLessThan(80);
  await expect(page).toHaveScreenshot("landing-markdown-preview-mobile.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
    scale: "css",
  });

  await page.goto("/landing-preview?dev&left&dark", {
    waitUntil: "domcontentloaded",
  });

  const carousel = page.getByTestId("workspace-layout-v2-pane-main");
  const mobileSidebar = page.getByTestId(LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID);

  await expect(mobileSidebar).toBeVisible();
  await expectSidebarLinksToMatchMarkdown(mobileSidebar);

  await mobileSidebar
    .getByRole("link", {
      name: "6: Connect Codex to GitHub",
    })
    .click();

  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        dark: url.searchParams.has("dark"),
        dev: url.searchParams.has("dev"),
        hash: url.hash,
        left: url.searchParams.has("left"),
      };
    })
    .toEqual({
      dark: true,
      dev: true,
      hash: "#6-connect-codex-to-github",
      left: true,
    });
  await expect.poll(() => carousel.evaluate((element) => element.scrollLeft)).toBeLessThan(80);

  const articleHeading = page
    .getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID)
    .locator('[id="6-connect-codex-to-github"]');
  await expect(articleHeading).toHaveCount(1);

  const targetTop = await articleHeading.evaluate((element) => element.getBoundingClientRect().top);
  expect(targetTop).toBeGreaterThan(0);
  expect(targetTop).toBeLessThan(80);
});
