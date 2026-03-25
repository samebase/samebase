import { expect, test } from "@playwright/test";

test("logo iso controls panel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/logo-iso?isoSide=6", {
    waitUntil: "domcontentloaded",
  });

  const controlsButton = page.getByRole("button", { name: "Controls" });
  await expect(controlsButton).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await controlsButton.click();

  const controlsPanel = page.getByRole("dialog", { name: "Logo controls" });
  await expect(controlsPanel).toBeVisible();
  await expect(controlsPanel).toContainText("Cube Side");
  await expect(controlsPanel).toContainText("6px");

  const screenshot = await controlsPanel.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  expect(screenshot).toMatchSnapshot("logo-iso-controls.png", {
    maxDiffPixelRatio: 0.01,
  });
});
