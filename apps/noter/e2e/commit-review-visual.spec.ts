import { expect, test } from "@playwright/test";

const SCENARIOS = [
  {
    mode: "inline",
    snapshotName: "commit-review-inline.png",
  },
  {
    mode: "conflict",
    snapshotName: "commit-review-conflict.png",
  },
  {
    mode: "deleted",
    snapshotName: "commit-review-deleted.png",
  },
  {
    mode: "unchanged",
    snapshotName: "commit-review-unchanged.png",
  },
] as const;

for (const scenario of SCENARIOS) {
  test(`commit review fixture (${scenario.mode})`, async ({ page }) => {
    await page.goto(`/visual-fixture.html?mode=${scenario.mode}`);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForLoadState("networkidle");
    const fixture = page.getByTestId("commit-review-visual-fixture");
    await expect(fixture).toHaveScreenshot(scenario.snapshotName, {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    });
  });
}

test("commit review fixture exposes deleted sidebar revert action", async ({
  page,
}) => {
  await page.goto("/visual-fixture.html?mode=deleted");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForLoadState("networkidle");

  const sidebar = page.getByTestId("commit-review-visual-sidebar");
  await sidebar.getByText("components.json", { exact: true }).click({
    button: "right",
  });

  await expect(
    page.getByRole("button", { name: "Revert deletion" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot(
    "commit-review-deleted-sidebar-context-menu.png",
    {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      maxDiffPixelRatio: 0.03,
    },
  );
});

test("commit review fixture renders deleted staged changes popup", async ({
  page,
}) => {
  await page.goto("/visual-fixture.html?mode=deleted-staged-changes");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByTestId("commit-review-staged-changes-trigger"),
  ).toBeVisible();
  await expect(
    page.getByTestId("commit-review-staged-changes-popover"),
  ).toBeVisible();
  const deletedAgentsFile = page.getByRole("button", { name: "AGENTS.md" });
  await expect(deletedAgentsFile).toBeVisible();
  await expect(
    page.getByTestId("commit-review-visual-fixture"),
  ).toHaveScreenshot("commit-review-deleted-staged-changes.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  await deletedAgentsFile.click();
  await expect(
    page.getByTestId("commit-review-staged-changes-location"),
  ).toContainText("/vault/noter-md/noter/main/AGENTS.md?diff");
});
