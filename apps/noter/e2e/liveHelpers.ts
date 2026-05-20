import { type Page } from "@playwright/test";

export async function signInIfNeeded(page: Page): Promise<void> {
  const autofillButton = page.getByRole("button", {
    name: "Autofill & sign in",
  });
  const vaultsLabel = page.getByText("Your Vaults", { exact: true }).first();
  const providersButton = page.getByRole("button", { name: "Providers" });
  const emptyStateHeading = page.getByRole("heading", {
    name: "Create your first project",
  });

  try {
    await autofillButton.waitFor({ state: "visible", timeout: 5_000 });
    await autofillButton.click();
  } catch {
    // The autofill shortcut is absent once a session is already active.
  }

  await Promise.any([
    vaultsLabel.waitFor({ state: "visible", timeout: 30_000 }),
    providersButton.waitFor({ state: "visible", timeout: 30_000 }),
    emptyStateHeading.waitFor({ state: "visible", timeout: 30_000 }),
  ]);
}
