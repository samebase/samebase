import { expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

import { internal } from "../convex/_generated/api";
import { createLocalConvexAdminClient } from "../scripts/localConvexAdminClient.ts";
import { PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID } from "../src/lib/publicLanding";

const LOCAL_CONFIG_PATH = fileURLToPath(
  new URL("../.convex/local/default/config.json", import.meta.url),
);
const ACCEPTANCE_PASSWORD = "organization-context-pass-1234";

type AcceptanceOrganization =
  (typeof internal.organizationContextAcceptanceFixtures.apply)["_args"]["organizations"][number];

export async function createOrganizationContextAcceptanceAccount(page: Page, email: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const accountSection = page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
  const emailInput = accountSection.getByPlaceholder("you@example.com");
  await emailInput.waitFor({ state: "visible" });
  await accountSection.getByRole("button", { name: "Need an account?" }).click();
  await emailInput.fill(email);
  await accountSection.getByPlaceholder("Password").fill(ACCEPTANCE_PASSWORD);
  await accountSection.getByRole("button", { exact: true, name: "Create account" }).click();
  await expect(emailInput).toBeHidden();
}

export async function signInOrganizationContextAcceptanceAccount(page: Page, email: string) {
  const accountSection = page.getByTestId(PUBLIC_LANDING_ACCOUNT_SECTION_TEST_ID);
  const emailInput = accountSection.getByPlaceholder("you@example.com");
  await emailInput.waitFor({ state: "visible" });
  await emailInput.fill(email);
  await accountSection.getByPlaceholder("Password").fill(ACCEPTANCE_PASSWORD);
  await accountSection.getByRole("button", { exact: true, name: "Sign in" }).click();
  await expect(emailInput).toBeHidden();
}

export async function applyOrganizationContextAcceptanceFixture(args: {
  email: string;
  organizations: AcceptanceOrganization[];
}) {
  const client = await createLocalConvexAdminClient(LOCAL_CONFIG_PATH);
  return await client.mutation(internal.organizationContextAcceptanceFixtures.apply, args);
}
