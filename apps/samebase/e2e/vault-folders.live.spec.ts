import { expect, test } from "@playwright/test";
import { signInIfNeeded } from "./liveHelpers";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function deleteFolderIfPresent(page: import("@playwright/test").Page, folderName: string) {
  const actions = page.getByRole("button", {
    exact: true,
    name: `Actions for folder ${folderName}`,
  });
  if (!(await actions.isVisible().catch(() => false))) {
    return;
  }

  await actions.click();
  await page.getByRole("menuitem", { exact: true, name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { exact: true, name: "Delete folder" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("vault folders live flow", () => {
  test("creates, collapses, renames, and deletes a folder without changing the route", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "Folder mutations run in one desktop browser to avoid shared vault assignment races.",
    );
    const initialFolderName = `UI folder ${Date.now()}`;
    const renamedFolderName = `${initialFolderName} renamed`;
    let cleanupFolderName = initialFolderName;

    await page.goto("/vault", { waitUntil: "domcontentloaded" });
    await signInIfNeeded(page, "/vault");

    const vaultNavigation = page.getByRole("navigation", { name: "Vaults" });
    const firstVaultLink = vaultNavigation.getByRole("link").first();
    test.skip(
      !(await firstVaultLink.isVisible().catch(() => false)),
      "No seeded vault is available. This test does not create a vault or provider resource.",
    );

    const vaultRoute = await firstVaultLink.getAttribute("href");
    const vaultLabel = await firstVaultLink.getAttribute("aria-label");
    if (!vaultRoute || !vaultLabel) {
      throw new Error("The seeded vault link has no route or label.");
    }
    const repositoryFullName = vaultLabel.split(",")[0];
    const selectedPath = new URL(vaultRoute, page.url()).pathname;

    try {
      await page.goto(vaultRoute, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(selectedPath)}(?:[?#]|$)`));

      await page
        .getByRole("button", { exact: true, name: `Actions for ${repositoryFullName}` })
        .click();
      await page.getByRole("menuitem", { exact: true, name: "New folder" }).click();
      const createDialog = page.getByRole("dialog");
      await createDialog
        .getByRole("textbox", { exact: true, name: "Folder name" })
        .fill(initialFolderName);
      await createDialog.getByRole("button", { exact: true, name: "Create folder" }).click();
      await expect(createDialog).toBeHidden();
      await expect(page.getByText(initialFolderName, { exact: true })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(selectedPath)}(?:[?#]|$)`));

      await page
        .getByRole("button", { exact: true, name: `Collapse ${initialFolderName}` })
        .click();
      await expect(
        page.getByRole("button", { exact: true, name: `Expand ${initialFolderName}` }),
      ).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(selectedPath)}(?:[?#]|$)`));

      await page
        .getByRole("button", { exact: true, name: `Actions for folder ${initialFolderName}` })
        .click();
      await page.getByRole("menuitem", { exact: true, name: "Rename" }).click();
      const renameDialog = page.getByRole("dialog");
      await renameDialog
        .getByRole("textbox", { exact: true, name: "Folder name" })
        .fill(renamedFolderName);
      await renameDialog.getByRole("button", { exact: true, name: "Rename folder" }).click();
      await expect(renameDialog).toBeHidden();
      cleanupFolderName = renamedFolderName;
      await expect(page.getByText(renamedFolderName, { exact: true })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(selectedPath)}(?:[?#]|$)`));

      await deleteFolderIfPresent(page, renamedFolderName);
      await expect(page.getByText(renamedFolderName, { exact: true })).toHaveCount(0);
      await expect(vaultNavigation.getByText("Ungrouped", { exact: true })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(selectedPath)}(?:[?#]|$)`));
    } finally {
      await deleteFolderIfPresent(page, cleanupFolderName);
    }
  });
});
