import { expect, test } from "@playwright/test";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
} from "../src/lib/landingMarkdownPreview";

const landingMarkdownPreviewSnapshotSuffix =
  process.platform === "linux" ? "linux" : "darwin";
const expectedLandingPreviewVideoSrcs = [
  "/landing-preview/step-1-create-accounts.mp4",
  "/landing-preview/step-2-use-template.mp4",
  "/landing-preview/step-3-connect-cloudflare-pages.mp4",
  "/landing-preview/step-4-create-convex-project.mp4",
  "/landing-preview/step-5-create-cloudflare-pages-deploy.mp4",
] as const;

test("landing markdown preview route renders markdown in workspace chrome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/landing-preview?dev", {
    waitUntil: "domcontentloaded",
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const preview = page.getByTestId(LANDING_MARKDOWN_PREVIEW_TEST_ID);
  const article = page.getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID);
  const sidebar = page.getByTestId(LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID);
  const rightSidebar = page.getByTestId("workspace-layout-v2-pane-right");

  await expect(preview).toBeVisible();
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByRole("link", {
      name: "1: Create Github, Convex, Cloudflare & OpenAI accounts",
    }),
  ).toHaveAttribute(
    "href",
    "#1-create-github-convex-cloudflare-openai-accounts",
  );
  await expect(rightSidebar).toBeVisible();
  await expect(
    article.getByRole("heading", {
      name: /Deploy a production-ready, real-time web-app/,
    }),
  ).toBeVisible();
  await expect(
    article.locator('[id="1-create-github-convex-cloudflare-openai-accounts"]'),
  ).toContainText("1: Create Github, Convex, Cloudflare & OpenAI accounts");
  await expect(article.locator("details")).toHaveCount(4);
  await expect(article.locator("details video")).toHaveCount(0);
  const videos = article.locator("video");
  await expect(videos).toHaveCount(expectedLandingPreviewVideoSrcs.length);
  for (const [
    index,
    expectedVideoSrc,
  ] of expectedLandingPreviewVideoSrcs.entries()) {
    const video = videos.nth(index);
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("src", expectedVideoSrc);
  }

  await expect(page).toHaveScreenshot(
    `landing-markdown-preview-${landingMarkdownPreviewSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );

  await sidebar
    .getByRole("link", {
      name: "4: Create a Convex project and a CONVEX_DEPLOY_KEY",
    })
    .click();
  await expect(page).toHaveURL(
    /#4-create-a-convex-project-and-a-convex-deploy-key$/,
  );
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

  await page.goto("/landing-preview?dev#why-is-noter-md-free", {
    waitUntil: "domcontentloaded",
  });
  const finalHeading = page
    .getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID)
    .locator('[id="why-is-noter-md-free"]');
  await expect(finalHeading).toBeInViewport();
  await expect
    .poll(() =>
      finalHeading.evaluate((element) => element.getBoundingClientRect().top),
    )
    .toBeLessThan(80);
});

test("landing markdown preview sidebar hash links keep the mobile sidebar open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/landing-preview?dev&left", {
    waitUntil: "domcontentloaded",
  });

  const layout = page.locator('[data-workspace-layout-v2="mobile"]');
  const carousel = page.getByTestId("workspace-layout-v2-pane-main");
  const sidebar = page.getByTestId(LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID);

  await expect(layout).toHaveAttribute("data-mobile-pane", "left");
  await expect(sidebar).toBeVisible();

  await sidebar
    .getByRole("link", {
      name: "6: Connect Codex to GitHub",
    })
    .click();

  await expect(page).toHaveURL(/\?dev&left#6-connect-codex-to-github$/);
  await expect(layout).toHaveAttribute("data-mobile-pane", "left");
  await expect
    .poll(() => carousel.evaluate((element) => element.scrollLeft))
    .toBeLessThan(80);

  const articleHeading = page
    .getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID)
    .locator('[id="6-connect-codex-to-github"]');
  await expect(articleHeading).toHaveCount(1);

  const targetTop = await articleHeading.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(targetTop).toBeGreaterThan(0);
  expect(targetTop).toBeLessThan(80);
});
