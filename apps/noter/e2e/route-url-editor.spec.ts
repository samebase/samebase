import { expect, test } from "@playwright/test";

test("route URL editor fixture navigates committed same-origin hrefs", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const host = await page.evaluate(() => window.location.host);
  const origin = await page.evaluate(() => window.location.origin);

  const originInput = page.getByTestId("route-url-editor-origin-input");
  const input = page.getByTestId("route-url-editor-input");
  const editor = page.getByTestId("route-url-editor");
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
  await expect(originInput).toHaveValue(host);
  await expect(originInput).toHaveAttribute("title", origin);
  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor");
  await expect(input).toHaveAttribute("title", `${host}/visual-fixture?mode=route-url-editor`);
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
  await expect(backButton).toBeVisible();
  await expect(forwardButton).toBeVisible();
  await expect(refreshButton).toBeVisible();
  await expect(backButton).toBeDisabled();
  await expect(forwardButton).toBeDisabled();
  await expect(goButton).toHaveCSS("opacity", "0");

  await input.focus();
  await expect(originInput).toHaveValue(origin);
  await expect(goButton).toHaveCSS("opacity", "1");

  await input.fill("/logo?from=route-url-editor");
  await expect(input).toHaveValue("/logo?from=route-url-editor");
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");

  await input.press("Enter");

  await expect(input).toHaveValue("/logo?from=route-url-editor");
  await expect(input).toHaveAttribute("title", `${host}/logo?from=route-url-editor`);
  await expect(currentHref).toHaveText("/logo?from=route-url-editor");
  await input.blur();
  await expect(originInput).toHaveValue(host);
  await expect(editor).toHaveScreenshot("route-url-editor-committed.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});

test("route URL editor fixture keeps the origin readonly beside the route input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const host = await page.evaluate(() => window.location.host);
  const origin = await page.evaluate(() => window.location.origin);

  const originInput = page.getByTestId("route-url-editor-origin-input");
  const input = page.getByTestId("route-url-editor-input");

  await expect(originInput).toHaveAttribute("readonly", "");
  await expect(originInput).toHaveValue(host);
  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor");

  await originInput.focus();
  await expect(originInput).toHaveValue(origin);
  await originInput.type("/");
  await expect(originInput).toHaveValue(origin);
  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor");
});

test("route URL editor fixture applies same-path search and hash edits while typing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");

  const input = page.getByTestId("route-url-editor-input");
  await input.focus();
  await input.press("End");
  await input.type("&draft=live#done");

  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor&draft=live#done");
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor&draft=live#done");
});

test("route URL editor fixture rejects external origins", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const host = await page.evaluate(() => window.location.host);

  const input = page.getByTestId("route-url-editor-input");
  const editor = page.getByTestId("route-url-editor");
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");

  await input.focus();
  await input.fill("https://example.com/noter");

  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveValue("https://example.com/noter");
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
  await input.press("Enter");
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
  await expect(editor).toHaveScreenshot("route-url-editor-reject-external.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
  await input.press("Escape");
  await expect(input).toHaveValue("/visual-fixture?mode=route-url-editor");
  await expect(page.getByTestId("route-url-editor-origin-input")).toHaveValue(host);
});
