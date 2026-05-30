import { type Locator, type Page } from "@playwright/test";
import {
  LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
  LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD,
} from "../../../runtime/localWorktreePasswordAuth";

type AdminRouteWaitUntil = "commit" | "domcontentloaded" | "load" | "networkidle";

type AdminRouteOptions = {
  beforeRoute?: () => Promise<void>;
  waitUntil?: AdminRouteWaitUntil;
};

/**
 * Admin route specs should enter through the same local account and then load
 * the target route after any browser-state setup the route reads on first render.
 */
export async function gotoAdminRoute(
  page: Page,
  url: string,
  options: AdminRouteOptions = {},
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await signInIfNeeded(page);
  await options.beforeRoute?.();
  await page.goto(url, { waitUntil: options.waitUntil ?? "networkidle" });
}

export async function signInIfNeeded(page: Page): Promise<void> {
  const emailInput = page.getByPlaceholder("you@example.com");
  const passwordInput = page.getByPlaceholder("Password");
  const signInButton = page.getByRole("button", { exact: true, name: "Sign in" });
  const signedInMarkers = getSignedInMarkers(page);

  try {
    await waitForAnyVisible(signedInMarkers, 1_000);
    return;
  } catch {
    // Fall through to the password form below.
  }

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await emailInput.waitFor({ state: "visible", timeout: 5_000 });
    } catch {
      await waitForAnyVisible(signedInMarkers, 30_000);
      return;
    }

    await emailInput.fill(LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL);
    await passwordInput.fill(LOCAL_WORKTREE_PASSWORD_AUTH_PASSWORD);
    await signInButton.click();

    try {
      await waitForAnyVisible(signedInMarkers, 10_000);
      return;
    } catch (error) {
      if (attempt === 5) {
        throw error;
      }
      await page.waitForTimeout(1_000);
    }
  }
}

function getSignedInMarkers(page: Page): Locator[] {
  return [
    page.getByRole("button", {
      name: LOCAL_WORKTREE_PASSWORD_AUTH_EMAIL,
    }),
    page.getByText("Your Vaults", { exact: true }).first(),
    page.getByRole("button", { name: "Providers" }),
    page.getByRole("heading", {
      name: "Create your first project",
    }),
  ];
}

async function waitForAnyVisible(locators: Locator[], timeout: number): Promise<void> {
  await Promise.any(locators.map((locator) => locator.waitFor({ state: "visible", timeout })));
}
