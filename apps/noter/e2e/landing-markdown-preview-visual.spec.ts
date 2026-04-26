import { expect, test } from "@playwright/test";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
} from "../src/lib/landingMarkdownPreview";

const landingMarkdownPreviewSnapshotSuffix =
  process.platform === "linux" ? "linux" : "darwin";

test("landing markdown preview fixture renders markdown in workspace chrome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/visual-fixture.html?mode=landing-markdown-preview", {
    waitUntil: "domcontentloaded",
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const preview = page.getByTestId(LANDING_MARKDOWN_PREVIEW_TEST_ID);
  const article = page.getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID);

  await expect(preview).toBeVisible();
  await expect(
    article.getByRole("heading", {
      name: /Deploy a production-ready, real-time web-app/,
    }),
  ).toBeVisible();
  await expect(article.locator("video source")).toHaveAttribute(
    "src",
    "/landing-preview/step-1-phone-screenrecording.mp4",
  );

  await expect(page).toHaveScreenshot(
    `landing-markdown-preview-${landingMarkdownPreviewSnapshotSuffix}.png`,
    {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
      scale: "css",
    },
  );
});
