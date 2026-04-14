import { expect, test } from "@playwright/test";

test("logo face color controls support custom hex colors", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    "/logo?leftColor=%23aabbcc&rightColor=%23123456&topColor=%23ffeedd",
    {
      waitUntil: "domcontentloaded",
    },
  );

  const controlsButton = page.getByRole("button", { name: "Controls" });
  await expect(controlsButton).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await controlsButton.click();

  const controlsPanel = page.getByRole("dialog", { name: "Logo controls" });
  await expect(controlsPanel).toBeVisible();

  const faceColorsButton = controlsPanel.getByRole("button", {
    name: "Face Colors",
  });
  await faceColorsButton.click();

  const faceColorsSection = page.getByTestId("logo-face-colors-section");
  await expect(faceColorsSection).toBeVisible();
  await expect(faceColorsSection.getByLabel("Left hex color")).toHaveValue(
    "#aabbcc",
  );
  await expect(faceColorsSection.getByLabel("Right hex color")).toHaveValue(
    "#123456",
  );
  await expect(faceColorsSection.getByLabel("Top hex color")).toHaveValue(
    "#ffeedd",
  );

  const screenshot = await faceColorsSection.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });

  expect(screenshot).toMatchSnapshot("logo-face-color-controls.png", {
    maxDiffPixelRatio: 0.06,
  });
});
