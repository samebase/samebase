import { expect, test, type Page } from "@playwright/test";
import { APP_BUILD_VERSION_TEST_ID } from "../src/lib/appBuild";

const legalShellScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

function getLegalShellScreenshotOptions(page: Page) {
  return {
    ...legalShellScreenshotOptions,
    // The app build footer changes on every squash; this screenshot verifies
    // the routed legal shell, not the current release label.
    mask: [page.getByTestId(APP_BUILD_VERSION_TEST_ID).locator("xpath=..")],
    maskColor: "#ffffff",
  };
}

async function readTermsRouteState(page: Page) {
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  await expect(page.locator(".cm-static-markdown")).toBeVisible();

  return await page.evaluate(() => ({
    hasWorkspaceMain:
      document.querySelector('[data-testid="workspace-layout-v2-pane-main"]') !== null,
    headingClassName: document.querySelector("h1")?.getAttribute("class") ?? null,
    title: document.title,
  }));
}

test("direct terms loads use the same routed app surface as client navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "/terms", exact: true }).first().click();
  await expect(page).toHaveURL(/\/terms$/);
  const clientNavigationState = await readTermsRouteState(page);
  await expect(page.getByTestId("workspace-layout-v2-pane-main")).toHaveScreenshot(
    "terms-shell.png",
    getLegalShellScreenshotOptions(page),
  );

  await page.goto("/terms", { waitUntil: "networkidle" });
  const directLoadState = await readTermsRouteState(page);
  await expect(page.getByTestId("workspace-layout-v2-pane-main")).toHaveScreenshot(
    "terms-shell.png",
    getLegalShellScreenshotOptions(page),
  );

  expect(directLoadState).toEqual(clientNavigationState);
  expect(directLoadState.hasWorkspaceMain).toBe(true);
  expect(directLoadState.title).toBe("Terms of Service | noter");
});
