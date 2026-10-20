import { expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

import { internal } from "../convex/_generated/api";
import { createLocalConvexAdminClient } from "../scripts/localConvexAdminClient.ts";
import {
  APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID,
  PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID,
} from "../src/lib/publicLanding";

const LOCAL_CONFIG_PATH = fileURLToPath(
  new URL("../.convex/local/default/config.json", import.meta.url),
);
const ACCEPTANCE_PASSWORD = "organization-context-pass-1234";

type AcceptanceOrganization =
  (typeof internal.devAuth.applyOrganizationContextAcceptanceFixture)["_args"]["organizations"][number];

async function waitForAuthenticatedAccount(page: Page) {
  await expect(
    page
      .getByTestId(APP_RIGHT_SIDEBAR_ACCOUNT_SECTION_TEST_ID)
      .getByRole("link", { name: "Account settings" }),
  ).toBeVisible({ timeout: 30_000 });
}

export async function createOrganizationContextAcceptanceAccount(page: Page, email: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const accountSection = page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
  const emailInput = accountSection.getByPlaceholder("you@example.com");
  await emailInput.waitFor({ state: "visible" });
  // The landing page is a prerendered file whose form shows before hydration, when the toggle does
  // nothing yet, so the click repeats until the sign-up form shows.
  const createAccountButton = accountSection.getByRole("button", {
    exact: true,
    name: "Create account",
  });
  await expect(async () => {
    await accountSection.getByRole("button", { name: "Need an account?" }).click();
    await expect(createAccountButton).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await emailInput.fill(email);
  await accountSection.getByPlaceholder("Password").fill(ACCEPTANCE_PASSWORD);
  await createAccountButton.click();
  // A sign-up on the landing page opens the dashboard with a document load.
  await page.waitForURL((url) => url.pathname === "/repo");
  await waitForAuthenticatedAccount(page);
}

export async function signInOrganizationContextAcceptanceAccount(page: Page, email: string) {
  const accountSection = page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
  const emailInput = accountSection.getByPlaceholder("you@example.com");
  await emailInput.waitFor({ state: "visible" });
  await emailInput.fill(email);
  await accountSection.getByPlaceholder("Password").fill(ACCEPTANCE_PASSWORD);
  await accountSection.getByRole("button", { exact: true, name: "Sign in" }).click();
  await waitForAuthenticatedAccount(page);
}

export async function applyOrganizationContextAcceptanceFixture(args: {
  email: string;
  organizations: AcceptanceOrganization[];
}) {
  const client = await createLocalConvexAdminClient(LOCAL_CONFIG_PATH);
  return await client.mutation(internal.devAuth.applyOrganizationContextAcceptanceFixture, args);
}
