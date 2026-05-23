import { expect, test } from "@playwright/test";

test("route URL editor fixture navigates committed same-origin hrefs", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const host = await page.evaluate(() => window.location.host);
  const origin = await page.evaluate(() => window.location.origin);

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
  await expect(input).toHaveValue(`${host}/visual-fixture?mode=route-url-editor`);
  await expect(input).toHaveAttribute("title", `${host}/visual-fixture?mode=route-url-editor`);
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
  await expect(backButton).toBeVisible();
  await expect(forwardButton).toBeVisible();
  await expect(refreshButton).toBeVisible();
  await expect(backButton).toBeDisabled();
  await expect(forwardButton).toBeDisabled();
  await expect(goButton).toHaveCSS("opacity", "0");

  await input.focus();
  await expect(input).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);
  await expect(goButton).toHaveCSS("opacity", "1");

  await input.fill("/logo?from=route-url-editor");
  await expect(input).toHaveValue(`${origin}/logo?from=route-url-editor`);
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");

  await input.press("Enter");

  await expect(input).toHaveValue(`${origin}/logo?from=route-url-editor`);
  await expect(input).toHaveAttribute("title", `${host}/logo?from=route-url-editor`);
  await expect(currentHref).toHaveText("/logo?from=route-url-editor");
  await input.blur();
  await expect(input).toHaveValue(`${host}/logo?from=route-url-editor`);
  await expect(editor).toHaveScreenshot("route-url-editor-committed.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});

test("route URL editor fixture selects continuously across host and route text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const host = await page.evaluate(() => window.location.host);
  const origin = await page.evaluate(() => window.location.origin);

  const input = page.getByTestId("route-url-editor-input");
  const routePath = "/visual-fixture";

  await expect(input).toHaveValue(`${host}/visual-fixture?mode=route-url-editor`);

  await input.focus();
  await expect(input).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);
  const drag = await input.evaluate(
    (element, args) => {
      const style = window.getComputedStyle(element);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context === null) {
        throw new Error("Expected canvas text measurement support.");
      }

      context.font = style.font;
      const rect = element.getBoundingClientRect();
      const hostStart = element.value.indexOf(args.host);
      const routeStart = element.value.indexOf(args.routePath);
      if (hostStart === -1 || routeStart === -1) {
        throw new Error("Expected route URL editor value to include host and route path.");
      }
      const routeEnd = routeStart + args.routePath.length;

      const xForOffset = (offset: number) =>
        rect.left +
        Number.parseFloat(style.paddingLeft) +
        context.measureText(element.value.slice(0, offset)).width;

      return {
        startX: xForOffset(hostStart) + 1,
        endX: xForOffset(routeEnd) - 1,
        y: rect.top + rect.height / 2,
      };
    },
    { host, routePath },
  );
  await page.mouse.move(drag.startX, drag.y);
  await page.mouse.down();
  await page.mouse.move(drag.endX, drag.y, { steps: 12 });
  await page.mouse.up();

  const selectedText = await input.evaluate((element) => {
    const selectionStart = element.selectionStart;
    const selectionEnd = element.selectionEnd;
    if (selectionStart === null || selectionEnd === null) {
      throw new Error("Expected route URL editor input selection.");
    }

    return element.value.slice(selectionStart, selectionEnd);
  });

  expect(selectedText).toBe(`${host}${routePath}`);
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
  const origin = await page.evaluate(() => window.location.origin);
  await input.focus();
  await input.press("End");
  await input.type("&draft=live#done");

  await expect(input).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor&draft=live#done`);
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
  await expect(input).toHaveValue(`${host}/visual-fixture?mode=route-url-editor`);
});
