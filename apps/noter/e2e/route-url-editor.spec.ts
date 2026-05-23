import { expect, test } from "@playwright/test";

test("route URL editor fixture navigates committed same-origin hrefs", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const host = await page.evaluate(() => window.location.host);
  const protocol = await page.evaluate(() => `${window.location.protocol}//`);

  const input = page.getByTestId("route-url-editor-input");
  const editor = page.getByTestId("route-url-editor");
  const protocolPrefix = page.getByTestId("route-url-editor-protocol");
  const hostPrefix = page.getByTestId("route-url-editor-host");
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");
  const backButton = page.getByRole("button", { name: "Back" });
  const forwardButton = page.getByRole("button", { name: "Forward" });
  const refreshButton = page.getByRole("button", { name: "Refresh" });
  const goButton = page.getByRole("button", { name: "Go to route URL" });
  const editorBox = await editor.boundingBox();
  if (editorBox === null) {
    throw new Error("Expected route URL editor to be visible.");
  }

  expect(editorBox.x).toBe(0);
  expect(editorBox.height).toBeLessThanOrEqual(40);
  await expect(hostPrefix).toHaveText(host);
  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor");
  await expect(input).toHaveAttribute("title", `${host}/visual-fixture?mode=route-url-editor`);
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
  await expect(backButton).toBeVisible();
  await expect(forwardButton).toBeVisible();
  await expect(refreshButton).toBeVisible();
  await expect(backButton).toBeDisabled();
  await expect(forwardButton).toBeDisabled();
  await expect(goButton).toHaveCSS("opacity", "0");
  await expect(protocolPrefix).toBeHidden();

  await input.focus();
  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor");
  await expect(protocolPrefix).toHaveText(protocol);
  await expect(protocolPrefix).toBeVisible();
  await expect(goButton).toHaveCSS("opacity", "1");

  await input.fill(`${host}/visual-fixture?mode=route-url-editor&draft=edited#done`);
  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor&draft=edited#done");
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");

  await input.press("Enter");

  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor&draft=edited#done");
  await expect(input).toHaveAttribute(
    "title",
    `${host}/visual-fixture?mode=route-url-editor&draft=edited#done`,
  );
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor&draft=edited#done");
  await input.blur();
  await expect(hostPrefix).toHaveText(host);
  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor&draft=edited#done");
  await expect(protocolPrefix).toBeHidden();
});

test("route URL editor fixture rejects external origins", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const host = await page.evaluate(() => window.location.host);

  const input = page.getByTestId("route-url-editor-input");
  const hostPrefix = page.getByTestId("route-url-editor-host");
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");

  await input.focus();
  await input.fill("https://example.com/noter");
  await input.press("Enter");

  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveValue("https://example.com/noter");
  await expect(hostPrefix).toHaveCount(0);
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
  await input.press("Escape");
  await expect(page.getByTestId("route-url-editor-host")).toHaveText(host);
  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor");
});
