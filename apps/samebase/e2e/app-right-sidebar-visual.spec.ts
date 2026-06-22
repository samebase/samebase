import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL } from "../../../runtime/localWorktreePasswordAuth";
import {
  AUTH_PROVIDER_STORAGE_KEY,
  PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY,
} from "../src/lib/authStorageKeys";
import { signInIfNeeded } from "./liveHelpers";
import { expectScreenshotsToMatch } from "./visualDiff";

const appRightSidebarScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

async function blockHydrationScripts(page: Page) {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "script") {
      await route.continue();
      return;
    }

    await route.fulfill({
      body: "",
      contentType: "text/javascript",
      status: 200,
    });
  });
}

async function waitForFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

function getRightSidebar(page: Page) {
  return page.locator('[data-workspace-layout-v2-mobile-pane="right"]');
}

function getSignedInAccountSection(page: Page) {
  return getRightSidebar(page).locator(".vault-dashboard-sidebar-inset").first();
}

async function readAccountTextEvidence(accountSection: Locator) {
  return accountSection.evaluate((element) => {
    const readAfterContent = (selector: string) => {
      const target = element.querySelector(selector);
      if (!target) {
        return null;
      }

      return window.getComputedStyle(target, "::after").content;
    };

    return {
      emailAfterContent: readAfterContent("[data-app-auth-prehydration-email]"),
      providerAfterContent: readAfterContent("[data-app-auth-prehydration-provider]"),
      textContent: element.textContent ?? "",
    };
  });
}

function accountTextEvidenceIncludes(
  evidence: Awaited<ReturnType<typeof readAccountTextEvidence>>,
  text: string,
  pseudoContent: string | null,
) {
  return evidence.textContent.includes(text) || pseudoContent === JSON.stringify(text);
}

test("signed-in app right sidebar renders a static account section", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/");
  await page.waitForLoadState("networkidle");

  const rightSidebar = getRightSidebar(page);
  const accountSection = getSignedInAccountSection(page);

  await expect(accountSection).toBeVisible();
  await expect(accountSection.getByText("not logged in", { exact: true })).toHaveCount(0);
  await expect(accountSection.getByText(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL)).toBeVisible();
  await expect(accountSection.getByText("Signed in with Password", { exact: true })).toBeVisible();
  await expect(accountSection.getByTestId("dashboard-sidebar-account-icon")).toBeVisible();
  await expect(accountSection.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(accountSection.locator("[aria-expanded]")).toHaveCount(0);
  await expect(rightSidebar.getByRole("link", { name: "Providers", exact: true })).toHaveAttribute(
    "href",
    "/providers",
  );
  await expect(rightSidebar.getByTestId("dashboard-sidebar-providers-section")).toHaveCount(0);
  await expect(accountSection).toHaveScreenshot(
    "app-right-sidebar-signed-in-account-section.png",
    appRightSidebarScreenshotOptions,
  );
});

test("signed-in app right sidebar prehydration includes the password provider label", async ({
  page,
}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page, "/");
  await page.waitForLoadState("networkidle");
  await waitForFonts(page);

  const hydratedAccountSection = getSignedInAccountSection(page);
  await expect(
    hydratedAccountSection.getByText("Signed in with Password", { exact: true }),
  ).toBeVisible();
  const hydratedScreenshot = await hydratedAccountSection.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  await page.evaluate(
    ({ authProviderStorageKey, passwordAuthModeStorageKey }) => {
      window.localStorage.removeItem(authProviderStorageKey);
      window.localStorage.setItem(passwordAuthModeStorageKey, "local_worktree_seed");
    },
    {
      authProviderStorageKey: AUTH_PROVIDER_STORAGE_KEY,
      passwordAuthModeStorageKey: PUBLIC_LANDING_PASSWORD_AUTH_MODE_STORAGE_KEY,
    },
  );
  await blockHydrationScripts(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await waitForFonts(page);

  const prehydratedAccountSection = getSignedInAccountSection(page);
  await expect(prehydratedAccountSection).toBeVisible();
  await expect(prehydratedAccountSection.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(prehydratedAccountSection.locator("[aria-expanded]:visible")).toHaveCount(0);
  const prehydratedTextEvidence = await readAccountTextEvidence(prehydratedAccountSection);
  expect(
    accountTextEvidenceIncludes(
      prehydratedTextEvidence,
      LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
      prehydratedTextEvidence.emailAfterContent,
    ),
  ).toBe(true);
  expect(
    accountTextEvidenceIncludes(
      prehydratedTextEvidence,
      "Signed in with Password",
      prehydratedTextEvidence.providerAfterContent,
    ),
  ).toBe(true);

  const prehydratedScreenshot = await prehydratedAccountSection.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  await expectScreenshotsToMatch({
    actual: prehydratedScreenshot,
    artifactPrefix: "app-right-sidebar-signed-in-account-prehydration",
    artifactWritePaths: {
      actual: testInfo.outputPath(
        "app-right-sidebar-signed-in-account-prehydration-prehydrated.png",
      ),
      diff: testInfo.outputPath("app-right-sidebar-signed-in-account-prehydration-diff.png"),
      diffMask: testInfo.outputPath(
        "app-right-sidebar-signed-in-account-prehydration-diff-mask.png",
      ),
      expected: testInfo.outputPath(
        "app-right-sidebar-signed-in-account-prehydration-hydrated.png",
      ),
    },
    expected: hydratedScreenshot,
    maxDiffPixelRatio: 0,
    pixelmatchOptions: {
      includeAA: true,
      threshold: 0,
    },
    testInfo,
  });
});
