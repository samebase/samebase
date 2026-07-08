import { expect, type Locator, type Page } from "@playwright/test";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../../../runtime/localWorktreePasswordAuth";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "../src/lib/publicLanding";

function buildSameOriginPath(page: Page, path: string): string {
  const targetUrl = new URL(path, page.url());

  return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
}

export async function signInIfNeeded(page: Page, routeAfterSignIn?: string): Promise<void> {
  const targetPath = routeAfterSignIn ? buildSameOriginPath(page, routeAfterSignIn) : null;
  const emailInput = page.getByPlaceholder("you@example.com");
  const passwordInput = page.getByPlaceholder("Password");
  const publicAccountButton = page
    .getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)
    .getByRole("button", { name: "not logged in" });
  const publicSignInLink = page
    .getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID)
    .getByRole("link", { name: "?sign-in" });
  const signInButton = page.getByRole("button", { exact: true, name: "Sign in" });
  const signedInMarkers = getSignedInMarkers(page);

  try {
    await waitForAnyVisible(signedInMarkers, 1_000);
    await navigateAfterSignIn(page, targetPath);
    return;
  } catch {
    // Fall through to the password form below.
  }

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      if (!(await emailInput.isVisible().catch(() => false))) {
        if (await publicAccountButton.isVisible().catch(() => false)) {
          await publicAccountButton.click();
        }
        if (await publicSignInLink.isVisible().catch(() => false)) {
          await publicSignInLink.click();
        }
      }
      await emailInput.waitFor({ state: "visible", timeout: 5_000 });
    } catch {
      await waitForAnyVisible(signedInMarkers, 30_000);
      await navigateAfterSignIn(page, targetPath);
      return;
    }
    await waitForPasswordFormReadyOrSignedIn({
      emailInput,
      signedInMarkers,
      timeout: 30_000,
    });
    if (await isAnyVisible(signedInMarkers)) {
      await navigateAfterSignIn(page, targetPath);
      return;
    }

    await emailInput.fill(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL);
    await passwordInput.fill(LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD);
    await signInButton.click();

    try {
      await waitForAnyVisible(signedInMarkers, 30_000);
      await navigateAfterSignIn(page, targetPath);
      return;
    } catch (error) {
      if (attempt === 5) {
        throw error;
      }
      await page.waitForTimeout(1_000);
    }
  }
}

async function waitForPasswordFormReadyOrSignedIn({
  emailInput,
  signedInMarkers,
  timeout,
}: {
  emailInput: Locator;
  signedInMarkers: Locator[];
  timeout: number;
}): Promise<void> {
  await expect
    .poll(
      async () =>
        (await isAnyVisible(signedInMarkers)) || (await emailInput.isEnabled().catch(() => false)),
      { timeout },
    )
    .toBe(true);
}

async function isAnyVisible(locators: Locator[]): Promise<boolean> {
  const visibilityResults = await Promise.all(
    locators.map((locator) => locator.isVisible().catch(() => false)),
  );

  return visibilityResults.some(Boolean);
}

function getSignedInMarkers(page: Page): Locator[] {
  const accountSection = page.getByTestId("dashboard-sidebar-account-section");

  return [
    accountSection.getByText(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL, { exact: true }),
    accountSection.getByRole("button", { name: "Sign out" }),
    page.getByText("Your Vaults", { exact: true }).first(),
    page.getByRole("link", { name: "Providers", exact: true }),
    page.getByRole("heading", {
      name: "Create your first project",
    }),
  ];
}

async function waitForAnyVisible(locators: Locator[], timeout: number): Promise<void> {
  await expect.poll(async () => isAnyVisible(locators), { timeout }).toBe(true);
}

async function navigateAfterSignIn(page: Page, targetPath: string | null): Promise<void> {
  if (targetPath === null || buildSameOriginPath(page, page.url()) === targetPath) {
    return;
  }

  await page.goto(targetPath, { waitUntil: "domcontentloaded" });
}
