import { expect, test } from "@playwright/test";

test("machines workspace fixture", async ({ page }) => {
  await page.goto("/visual-fixture.html?mode=machines-workspace", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const header = page.getByTestId("machines-workspace-visual-fixture-header");
  await expect(header).toHaveScreenshot("machines-workspace-header.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });

  const sidebar = page.getByTestId("machines-workspace-visual-fixture-sidebar");
  await expect(sidebar).toHaveScreenshot("machines-workspace-page.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.03,
  });
});

test("machines workspace project collapse stays closed", async ({ page }) => {
  await page.goto("/visual-fixture.html?mode=machines-workspace", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const projectToggle = page.getByRole("button", { name: "noter" });
  const projectThread = page.getByRole("button", {
    name: /Research sidebar resizing/,
  });

  await expect(projectThread).toBeVisible();
  await projectToggle.click();
  await expect(projectThread).toBeHidden();

  await page.waitForTimeout(1200);
  await expect(projectThread).toBeHidden();
});
