import { expect, test } from "@playwright/test";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
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

async function signInThroughLocalLanding(
  page: Parameters<typeof test>[0]["page"],
) {
  await page.goto("/?dev", {
    waitUntil: "domcontentloaded",
  });

  const accountButton = page.getByRole("button", { name: /@/ }).first();
  try {
    await accountButton.waitFor({ state: "visible", timeout: 5_000 });
    return;
  } catch {
    // The account menu is absent before the local autofill flow completes.
  }

  const autofillButton = page.getByRole("button", {
    name: "Autofill & sign in",
  });
  await autofillButton.waitFor({ state: "visible", timeout: 5_000 });
  await autofillButton.click();

  const vaultsLabel = page.getByText("Your Vaults", { exact: true }).first();
  const emptyStateHeading = page.getByRole("heading", {
    name: "Create your first project",
  });
  await Promise.any([
    accountButton.waitFor({ state: "visible", timeout: 30_000 }),
    vaultsLabel.waitFor({ state: "visible", timeout: 30_000 }),
    emptyStateHeading.waitFor({ state: "visible", timeout: 30_000 }),
  ]);
}

test("landing markdown preview route renders markdown in workspace chrome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInThroughLocalLanding(page);

  await page.goto("/landing-preview?dev", {
    waitUntil: "domcontentloaded",
  });

  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const preview = page.getByTestId(LANDING_MARKDOWN_PREVIEW_TEST_ID);
  const article = page.getByTestId(LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID);
  const rightSidebar = page.getByTestId("workspace-layout-v2-pane-right");

  await expect(preview).toBeVisible();
  await expect(rightSidebar).toBeVisible();
  await expect(
    article.getByRole("heading", {
      name: /Deploy a production-ready, real-time web-app/,
    }),
  ).toBeVisible();
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

  const firstTaskCheckbox = article.locator('input[type="checkbox"]').first();
  await expect(firstTaskCheckbox).toBeEnabled();
  await firstTaskCheckbox.check();
  await expect(firstTaskCheckbox).toBeChecked();
});
