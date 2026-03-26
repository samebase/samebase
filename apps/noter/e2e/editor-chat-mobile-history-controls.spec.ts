import { expect, test } from "@playwright/test";

test("mobile chat input undo and redo follow composer history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/visual-fixture.html?mode=editor-chat-open-mobile", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  const composer = page.locator(
    '[data-testid="editor-chat-panel-visual-fixture"] [contenteditable="true"]',
  );
  const undoButton = page.getByLabel("Undo");
  const redoButton = page.getByLabel("Redo");

  await expect(composer).toBeVisible();
  await expect(undoButton).toBeVisible();
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();

  const originalValue = (await composer.textContent())?.trim() ?? "";

  await composer.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");

  await expect(composer).toContainText(`${originalValue}!`);
  await expect(undoButton).toBeEnabled();
  await expect(redoButton).toBeDisabled();

  await undoButton.click();
  await expect(composer).toContainText(originalValue);
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeEnabled();

  await redoButton.click();
  await expect(composer).toContainText(`${originalValue}!`);
  await expect(undoButton).toBeEnabled();
});
