import { expect, test } from "@playwright/test";

test("route URL editor fixture navigates committed same-origin hrefs", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);
  const host = await page.evaluate(() => window.location.host);

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
  await expect(input).toHaveAttribute("title", `${origin}/visual-fixture?mode=route-url-editor`);
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

  await input.fill(`${origin}/logo?from=route-url-editor`);
  await expect(input).toHaveValue(`${origin}/logo?from=route-url-editor`);
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");

  await input.press("Enter");

  await expect(input).toHaveValue(`${origin}/logo?from=route-url-editor`);
  await expect(input).toHaveAttribute("title", `${origin}/logo?from=route-url-editor`);
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

test("route URL editor lists route paths and filters them while typing", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);
  const host = await page.evaluate(() => window.location.host);

  const input = page.getByTestId("route-url-editor-input");
  const suggestions = page.getByTestId("route-url-editor-path-suggestions");

  await input.focus();
  await expect(suggestions).toBeVisible();
  await expect(page.getByRole("option", { exact: true, name: "Use /" })).toBeVisible();
  await expect(page.getByRole("option", { exact: true, name: "Use /vault/$" })).toBeVisible();
  await expect(
    page.getByRole("option", {
      exact: true,
      name: "Use /vault/$owner/$repo/codespace/$branch/chat",
    }),
  ).toBeVisible();

  await input.press("End");
  await input.type("lo");

  await expect(page.getByRole("option", { exact: true, name: "Use /logo" })).toBeVisible();
  await expect(
    page.getByRole("option", { exact: true, name: "Use /logo/transition" }),
  ).toBeVisible();
  await expect(page.getByRole("option", { exact: true, name: "Use /pricing" })).toHaveCount(0);

  await page.getByRole("option", { exact: true, name: "Use /logo" }).click();

  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(input).toHaveValue(`${host}/logo`);
  await expect(suggestions).toHaveCount(0);
});

test("route URL editor fixture refuses changes that remove the origin slash prefix", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = page.getByTestId("route-url-editor-input");
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");

  await input.focus();
  await expect(input).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);

  await input.evaluate((element, currentOrigin) => {
    element.setSelectionRange(0, `${currentOrigin}/`.length);
  }, origin);
  await input.press("Backspace");

  await expect(input).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
});

test("route URL editor fixture refuses changes that merge host and path text", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = page.getByTestId("route-url-editor-input");
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");

  await input.focus();
  await expect(input).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);

  await input.evaluate((element, currentOrigin) => {
    element.setSelectionRange(currentOrigin.length, currentOrigin.length + 1);
  }, origin);
  await input.press("Backspace");

  await expect(input).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
});

test("route URL editor preserves caret when rejecting root slash deletion", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);
  const routeInputPrefix = `${origin}/`;

  const input = page.getByTestId("route-url-editor-input");

  await input.focus();
  await expect(input).toHaveValue(`${routeInputPrefix}logo`);

  await input.evaluate((element, prefix) => {
    element.setSelectionRange(`${prefix}l`.length, `${prefix}l`.length);
  }, routeInputPrefix);
  await input.press("Backspace");

  await expect(input).toHaveValue(`${routeInputPrefix}ogo`);
  await expect(input).toHaveJSProperty("selectionStart", routeInputPrefix.length);
  await expect(input).toHaveJSProperty("selectionEnd", routeInputPrefix.length);

  await input.press("Backspace");

  await expect(input).toHaveValue(`${routeInputPrefix}ogo`);
  await expect(input).toHaveJSProperty("selectionStart", routeInputPrefix.length);
  await expect(input).toHaveJSProperty("selectionEnd", routeInputPrefix.length);
});

test("route URL editor applies same-path search and hash edits while typing", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });

  const input = page.getByTestId("route-url-editor-input");
  const origin = await page.evaluate(() => window.location.origin);
  await input.focus();
  await input.fill(`${origin}/logo?leftFace=secondary#done`);

  await expect(input).toHaveValue(`${origin}/logo?leftFace=secondary#done`);
  await expect(page).toHaveURL(`${origin}/logo?leftFace=secondary#done`);

  await input.blur();

  const host = await page.evaluate(() => window.location.host);
  await expect(input).toHaveValue(`${host}/logo?leftFace=secondary#done`);
  await expect(page).toHaveURL(`${origin}/logo?leftFace=secondary#done`);
});

test("route URL editor toggles landing dev mode while preserving focused draft text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });

  const input = page.getByTestId("route-url-editor-input");
  const editor = page.getByTestId("route-url-editor");
  const host = await page.evaluate(() => window.location.host);
  const origin = await page.evaluate(() => window.location.origin);

  await expect(input).toHaveValue(host);
  await input.focus();
  await expect(input).toHaveValue(`${origin}/`);
  await input.press("End");
  await input.type("?dev");

  await expect(input).toHaveValue(`${origin}/?dev`);
  await expect(page).toHaveURL(`${origin}/?dev`);

  await input.press("Backspace");

  await expect(input).toHaveValue(`${origin}/?de`);
  await expect(page).toHaveURL(`${origin}/`);

  await input.blur();

  await expect(input).toHaveValue(host);
  await expect(page).toHaveURL(`${origin}/`);
  await expect(editor).toHaveScreenshot("route-url-editor-root-blurred.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});

test("route URL editor keeps invalid route search drafts local until blur", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/logo?leftFace=secondary", {
    waitUntil: "domcontentloaded",
  });

  const input = page.getByTestId("route-url-editor-input");
  const editor = page.getByTestId("route-url-editor");
  const origin = await page.evaluate(() => window.location.origin);

  await input.focus();
  await expect(input).toHaveValue(`${origin}/logo?leftFace=secondary`);

  await input.press("End");
  await input.press("Backspace");

  await expect(input).toHaveValue(`${origin}/logo?leftFace=secondar`);
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(editor).toHaveScreenshot("route-url-editor-invalid-draft-focused.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });

  await input.blur();

  const host = await page.evaluate(() => window.location.host);
  await expect(input).toHaveValue(`${host}/logo`);
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(editor).toHaveScreenshot("route-url-editor-invalid-draft-blurred.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
});

test("route URL editor fixture refuses pasted external origins", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = page.getByTestId("route-url-editor-input");
  const editor = page.getByTestId("route-url-editor");
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");

  await input.focus();
  await input.fill("https://example.com/noter");

  await expect(input).toHaveAttribute("aria-invalid", "false");
  await expect(input).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
  await input.press("Enter");
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
  await input.evaluate((element) => {
    const selectionOffset = element.value.length;
    element.setSelectionRange(selectionOffset, selectionOffset);
  });
  await expect(editor).toHaveScreenshot("route-url-editor-reject-external.png", {
    animations: "disabled",
    caret: "hide",
    scale: "css",
    maxDiffPixelRatio: 0.01,
  });
  await input.press("Escape");
  const host = await page.evaluate(() => window.location.host);
  await expect(input).toHaveValue(`${host}/visual-fixture?mode=route-url-editor`);
});
