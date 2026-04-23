import { expect, test } from "@playwright/test";

test("logo iso controls sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo-iso?isoSide=6", {
    waitUntil: "domcontentloaded",
  });

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  await expect(controlsSidebar).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await expect(controlsSidebar).toContainText("Cube side");
  await expect(controlsSidebar).toContainText("6px");

  const screenshot = await controlsSidebar.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  expect(screenshot).toMatchSnapshot("logo-iso-controls.png", {
    // The controls sidebar uses the app's system sans stack, which shifts text
    // metrics between macOS and Linux. Keep a bounded tolerance for that copy.
    maxDiffPixelRatio: 0.06,
  });
});

test("logo iso controls mobile pane switch", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/logo-iso?isoSide=6", {
    waitUntil: "domcontentloaded",
  });

  const workspace = page.locator('[data-workspace-layout-v2="mobile"]');
  await expect(workspace).toHaveAttribute("data-mobile-pane", "main");

  await page.getByRole("button", { name: "Controls" }).click();

  const controlsSidebar = page.getByTestId("workspace-layout-v2-pane-left");
  await expect(workspace).toHaveAttribute("data-mobile-pane", "left");
  await expect(controlsSidebar).toContainText("Cube side");
  await expect(controlsSidebar).toContainText("6px");

  await page.getByRole("button", { name: "Preview" }).click();
  await expect(workspace).toHaveAttribute("data-mobile-pane", "main");
  await expect(page.getByRole("button", { name: "Controls" })).toBeVisible();
});
