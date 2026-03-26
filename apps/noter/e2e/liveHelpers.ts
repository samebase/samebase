import { expect, type Page } from "@playwright/test";

export async function signInIfNeeded(page: Page): Promise<void> {
  const autofillButton = page.getByRole("button", {
    name: "Autofill & sign in",
  });

  try {
    await autofillButton.waitFor({ state: "visible", timeout: 5_000 });
    await autofillButton.click();
  } catch {
    // The autofill shortcut is absent once a session is already active.
  }

  await expect(
    page.getByRole("heading", {
      name: /^(Your Vaults|Create your first project)$/,
    }),
  ).toBeVisible({
    timeout: 30_000,
  });
}
