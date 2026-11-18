import { expect, test, type Page } from "@playwright/test";

async function expectRecoveryButtonLayout(
  page: Page,
  mode: "app-boot-failure-stale" | "app-boot-failure-generic",
  expectedButtonLayout: "row" | "stack",
) {
  await page.goto(`/visual-fixture?mode=${mode}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const reloadButton = page.getByRole("button", { name: "Reload app" });
  const resetButton = page.getByRole("button", { name: "Reset local data" });

  await expect(reloadButton).toBeVisible();
  await expect(resetButton).toBeVisible();

  const reloadBox = await reloadButton.boundingBox();
  const resetBox = await resetButton.boundingBox();

  if (reloadBox === null || resetBox === null) {
    throw new Error("Expected recovery action buttons to have bounding boxes.");
  }

  if (expectedButtonLayout === "row") {
    expect(Math.abs(reloadBox.y - resetBox.y)).toBeLessThanOrEqual(1);
    expect(resetBox.x).toBeGreaterThan(reloadBox.x + reloadBox.width / 2);
    return;
  }

  expect(Math.abs(reloadBox.x - resetBox.x)).toBeLessThanOrEqual(1);
  expect(resetBox.y).toBeGreaterThan(reloadBox.y + reloadBox.height / 2);
}

test("app boot failure visual fixture", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await expectRecoveryButtonLayout(page, "app-boot-failure-stale", "row");
});

test("app boot failure visual fixture (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expectRecoveryButtonLayout(page, "app-boot-failure-generic", "stack");
});
