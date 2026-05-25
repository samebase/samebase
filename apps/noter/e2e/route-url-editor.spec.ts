import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { getLandingMarkdownHeadings } from "../src/lib/landingMarkdownHeadings";

const landingPreviewMarkdown = readFileSync(
  new URL("../src/content/landing-preview.md", import.meta.url),
  "utf8",
);
const landingPreviewHashSuggestions = getLandingMarkdownHeadings(landingPreviewMarkdown).map(
  (heading) => heading.href,
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRouteUrlEditorDisplay(page: Page): Locator {
  return page.getByTestId("route-url-editor-display");
}

function getRouteUrlEditorInput(page: Page): Locator {
  return page.getByTestId("route-url-editor-input");
}

async function editRouteUrl(page: Page): Promise<Locator> {
  await getRouteUrlEditorDisplay(page).focus();
  const input = getRouteUrlEditorInput(page);
  await expect(input).toBeFocused();

  return input;
}

async function readRoundedLeft(locator: Locator, label: string): Promise<number> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`Expected ${label} to be visible.`);
  }

  return Math.round(box.x);
}

test("route URL editor fixture commits hrefs from the app workspace shell", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);
  const fixtureHref = `${origin}/visual-fixture?mode=route-url-editor`;

  const display = getRouteUrlEditorDisplay(page);
  const input = getRouteUrlEditorInput(page);
  const editor = page.getByTestId("route-url-editor");
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");
  const backButton = page.getByRole("button", { name: "Back" });
  const forwardButton = page.getByRole("button", { name: "Forward" });
  const editorBox = await editor.boundingBox();
  if (editorBox === null) {
    throw new Error("Expected route URL editor to be visible.");
  }

  expect(editorBox.height).toBeLessThanOrEqual(40);
  await expect(input).toHaveCount(0);
  await expect(display).toHaveValue(fixtureHref);
  await expect(display).toHaveAttribute("title", fixtureHref);
  await expect(display).toHaveCSS("cursor", "text");
  const displayTextIndent = await display.evaluate((element) =>
    Number.parseFloat(window.getComputedStyle(element).textIndent),
  );
  expect(displayTextIndent).toBeLessThan(0);
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
  await expect(backButton).toBeVisible();
  await expect(forwardButton).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Go to route URL" })).toHaveCount(0);
  await expect(backButton).toBeDisabled();
  await expect(forwardButton).toBeDisabled();

  await display.focus();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);

  await input.fill(`${origin}/logo?from=route-url-editor`);
  await expect(input).toHaveValue(`${origin}/logo?from=route-url-editor`);
  await expect(page).toHaveURL(`${origin}/logo?from=route-url-editor`);
  await expect(currentHref).toHaveCount(0);
  await expect(input).toBeFocused();

  await input.press("Enter");

  await expect(page).toHaveURL(`${origin}/logo?from=route-url-editor`);
  await expect(getRouteUrlEditorInput(page)).toHaveValue(`${origin}/logo?from=route-url-editor`);
  await expect(getRouteUrlEditorInput(page)).toHaveAttribute(
    "title",
    `${origin}/logo?from=route-url-editor`,
  );
  await getRouteUrlEditorInput(page).blur();
  await expect(input).toHaveCount(0);
  await expect(display).toHaveValue(`${origin}/logo?from=route-url-editor`);
  await expect(display).toHaveAttribute("title", `${origin}/logo?from=route-url-editor`);
  await expect(editor.getByTestId("route-url-editor-display")).toHaveValue(
    `${origin}/logo?from=route-url-editor`,
  );
});

test("route URL editor fixture selects continuously across host and route text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const host = await page.evaluate(() => window.location.host);
  const origin = await page.evaluate(() => window.location.origin);

  const display = getRouteUrlEditorDisplay(page);
  const routePath = "/visual-fixture";

  await expect(display).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);

  const input = await editRouteUrl(page);
  await expect(input).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);
  const selectionLength = await input.evaluate(
    (element, args) => {
      const hostStart = element.value.indexOf(args.host);
      const routeStart = element.value.indexOf(args.routePath);
      if (hostStart === -1 || routeStart === -1) {
        throw new Error("Expected route URL editor value to include host and route path.");
      }
      const routeEnd = routeStart + args.routePath.length;

      element.setSelectionRange(hostStart, hostStart);
      return routeEnd - hostStart;
    },
    { host, routePath },
  );
  await page.keyboard.down("Shift");
  for (let index = 0; index < selectionLength; index += 1) {
    await input.press("ArrowRight");
  }
  await page.keyboard.up("Shift");

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

test("route URL editor focuses the visible URL without rewriting", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);
  const display = getRouteUrlEditorDisplay(page);
  const fullHref = `${origin}/visual-fixture?mode=route-url-editor`;

  await expect(display).toHaveValue(fullHref);
  const textIndent = await display.evaluate((element) =>
    Number.parseFloat(window.getComputedStyle(element).textIndent),
  );
  expect(textIndent).toBeLessThan(0);

  await display.focus();

  const input = getRouteUrlEditorInput(page);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(fullHref);
  const clickState = await input.evaluate((element) => {
    const matches = element.value.match(/https?:\/\//g);
    return {
      protocolCount: matches === null ? 0 : matches.length,
    };
  });
  expect(clickState.protocolCount).toBe(1);
});

for (const shortcut of ["Meta+Backspace", "Control+Backspace"]) {
  test(`route URL editor clamps ${shortcut} to the route boundary`, async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 96 });
    await page.goto("/visual-fixture?mode=route-url-editor", {
      waitUntil: "domcontentloaded",
    });
    const origin = await page.evaluate(() => window.location.origin);
    const routeInputPrefix = `${origin}/`;
    const input = await editRouteUrl(page);

    await expect(input).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);

    await input.evaluate((element) => {
      const end = element.value.length;
      element.setSelectionRange(end, end);
    });
    await input.press(shortcut);

    await expect(input).toHaveValue(routeInputPrefix);
    await expect(input).toHaveJSProperty("selectionStart", routeInputPrefix.length);
    await expect(input).toHaveJSProperty("selectionEnd", routeInputPrefix.length);
    await expect(input).toHaveAttribute("aria-invalid", "false");
    await expect(page).toHaveURL(`${origin}/`);
    await expect(page.getByTestId("route-url-editor-fixture-current-href")).toHaveCount(0);

    await input.press(shortcut);

    await expect(input).toHaveValue(routeInputPrefix);
    await expect(input).toHaveJSProperty("selectionStart", routeInputPrefix.length);
    await expect(input).toHaveJSProperty("selectionEnd", routeInputPrefix.length);
    await expect(page).toHaveURL(`${origin}/`);
  });
}

test("route URL editor lists route paths and filters them while typing", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const display = getRouteUrlEditorDisplay(page);
  const input = await editRouteUrl(page);
  const suggestions = page.getByTestId("route-url-editor-suggestions");

  await expect(suggestions).toBeVisible();
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "path");
  await expect(page.getByRole("option", { exact: true, name: "Use /" })).toBeVisible();
  await expect(page.getByRole("option", { exact: true, name: "Use /logo" })).toBeVisible();
  await expect(page.getByRole("option", { exact: true, name: "Use /vault/$" })).toHaveCount(0);

  await input.press("End");
  await input.type("lo");

  await expect(page.getByRole("option", { exact: true, name: "Use /logo" })).toBeVisible();
  await expect(
    page.getByRole("option", { exact: true, name: "Use /logo/transition" }),
  ).toBeVisible();
  await expect(page.getByRole("option", { exact: true, name: "Use /pricing" })).toHaveCount(0);

  await page.getByRole("option", { exact: true, name: "Use /logo" }).dispatchEvent("click");

  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${origin}/logo`);
  await expect(suggestions).toHaveCount(0);

  await input.blur();

  await expect(input).toHaveCount(0);
  await expect(display).toHaveValue(`${origin}/logo`);
  await expect(suggestions).toHaveCount(0);
});

test("route URL editor keeps the same input focused while typing between app routes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = await editRouteUrl(page);
  const inputHandle = await input.elementHandle();
  if (inputHandle === null) {
    throw new Error("Expected route URL editor input to be mounted.");
  }

  await input.press("End");
  await input.type("logo");

  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(input).toHaveValue(`${origin}/logo`);
  const keptFocusOnLogo = await inputHandle.evaluate(
    (element) => document.activeElement === element && element.isConnected,
  );
  expect(keptFocusOnLogo).toBe(true);

  await input.type("/iso");

  await expect(page).toHaveURL(`${origin}/logo/iso`);
  await expect(input).toHaveValue(`${origin}/logo/iso`);
  const keptFocusOnLogoIso = await inputHandle.evaluate(
    (element) => document.activeElement === element && element.isConnected,
  );
  expect(keptFocusOnLogoIso).toBe(true);

  await input.fill(`${origin}/localStorage`);

  await expect(page).toHaveURL(`${origin}/localStorage`);
  await expect(input).toHaveValue(`${origin}/localStorage`);
  const keptFocusOnLocalStorage = await inputHandle.evaluate(
    (element) => document.activeElement === element && element.isConnected,
  );
  expect(keptFocusOnLocalStorage).toBe(true);
});

test("route URL editor previews trailing-slash app routes while typing", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = await editRouteUrl(page);
  const inputHandle = await input.elementHandle();
  if (inputHandle === null) {
    throw new Error("Expected route URL editor input to be mounted.");
  }

  await input.press("End");
  await input.type("logo/");

  await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(origin)}/logo/?$`));
  await expect(input).toHaveValue(`${origin}/logo/`);
  const keptFocusOnLogoTrailingSlash = await inputHandle.evaluate(
    (element) => document.activeElement === element && element.isConnected,
  );
  expect(keptFocusOnLogoTrailingSlash).toBe(true);
});

test("route URL editor dismisses suggestions through blur when the page underneath scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/logo?leftFace=secondary", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const display = getRouteUrlEditorDisplay(page);
  const input = await editRouteUrl(page);
  const suggestions = page.getByTestId("route-url-editor-suggestions");

  await input.press("End");
  await input.press("Backspace");

  await expect(input).toHaveValue(`${origin}/logo?leftFace=secondar`);
  await expect(page).toHaveURL(`${origin}/logo`);

  await page.mouse.move(360, 380);
  await page.mouse.wheel(0, 240);

  await expect(input).toHaveCount(0);
  await expect(suggestions).toHaveCount(0);
  await expect(display).toHaveValue(`${origin}/logo`);
  await expect(page).toHaveURL(`${origin}/logo`);
});

test("route URL editor switches suggestions by URL section", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/logo?dev#top", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = await editRouteUrl(page);
  const suggestions = page.getByTestId("route-url-editor-suggestions");

  await expect(input).toHaveValue(`${origin}/logo?dev#top`);

  await input.evaluate((element, currentOrigin) => {
    const pathCaret = `${currentOrigin}/l`.length;
    element.setSelectionRange(pathCaret, pathCaret);
  }, origin);
  await input.press("ArrowRight");
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "path");
  await expect(page.getByRole("option", { exact: true, name: "Use /logo" })).toBeVisible();

  await input.evaluate((element) => {
    const searchCaret = element.value.indexOf("?dev") + "?d".length;
    element.setSelectionRange(searchCaret, searchCaret);
  });
  await input.press("ArrowRight");
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search");
  await expect(page.getByRole("option", { exact: true, name: "Use ?dev" })).toBeVisible();
  await expect(page.getByRole("option", { exact: true, name: "Use ?devtools" })).toBeVisible();
  await expect(page.getByRole("option", { exact: true, name: "Use /logo" })).toHaveCount(0);

  await input.evaluate((element) => {
    const hashCaret = element.value.indexOf("#top") + "#".length;
    element.setSelectionRange(hashCaret, hashCaret);
  });
  await input.press("ArrowRight");
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "hash");
  await expect(page.getByRole("option", { exact: true, name: "Use #top" })).toBeVisible();
});

test("route URL editor lists rendered page hash targets", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  const expectedHashSuggestion = landingPreviewHashSuggestions[0];
  if (expectedHashSuggestion === undefined) {
    throw new Error("Expected landing preview markdown to have headings.");
  }
  const hashKey = expectedHashSuggestion.replace(/^#/, "");
  const hashDraft = hashKey.slice(0, 10);

  await page.goto("/landing-preview?dev", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForLoadState("networkidle");

  await expect(page.locator(`[data-landing-heading-id="${hashKey}"]`)).toHaveCount(1);

  const origin = await page.evaluate(() => window.location.origin);
  const input = await editRouteUrl(page);
  const suggestions = page.getByTestId("route-url-editor-suggestions");

  await input.fill(`${origin}/landing-preview?dev#${hashDraft}`);
  await input.evaluate((element) => {
    const caret = element.value.length;
    element.setSelectionRange(caret, caret);
  });
  await input.press("ArrowRight");

  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "hash");
  await expect(
    page.getByRole("option", { exact: true, name: `Use ${expectedHashSuggestion}` }),
  ).toBeVisible();
});

test("route URL editor selects suggestions with arrow keys", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const display = getRouteUrlEditorDisplay(page);
  const editor = page.getByTestId("route-url-editor");
  const suggestions = page.getByTestId("route-url-editor-suggestions");
  const backButton = editor.getByRole("button", { name: "Back" });
  const forwardButton = editor.getByRole("button", { name: "Forward" });
  const input = await editRouteUrl(page);
  const logoOption = page.getByRole("option", {
    exact: true,
    name: "Use /logo",
  });
  const logoIsoOption = page.getByRole("option", {
    exact: true,
    name: "Use /logo/iso",
  });

  await input.press("End");
  await input.type("log");

  await expect(logoOption).toBeVisible();
  await expect(logoIsoOption).toBeVisible();
  const initialEditorLeft = await readRoundedLeft(editor, "route URL editor");
  const initialSuggestionsLeft = await readRoundedLeft(suggestions, "route URL suggestions");

  await input.press("ArrowDown");
  await expect(logoOption).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(input).toHaveValue(`${origin}/logo`);
  expect(await readRoundedLeft(editor, "route URL editor")).toBe(initialEditorLeft);
  expect(await readRoundedLeft(suggestions, "route URL suggestions")).toBe(initialSuggestionsLeft);
  await expect(backButton).toBeDisabled();

  await input.press("ArrowDown");
  await expect(logoIsoOption).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${origin}/logo/iso`);
  await expect(input).toHaveValue(`${origin}/logo/iso`);
  expect(await readRoundedLeft(editor, "route URL editor")).toBe(initialEditorLeft);
  expect(await readRoundedLeft(suggestions, "route URL suggestions")).toBe(initialSuggestionsLeft);
  await expect(backButton).toBeDisabled();

  await input.press("ArrowUp");
  await expect(logoOption).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(input).toHaveValue(`${origin}/logo`);
  expect(await readRoundedLeft(editor, "route URL editor")).toBe(initialEditorLeft);
  expect(await readRoundedLeft(suggestions, "route URL suggestions")).toBe(initialSuggestionsLeft);
  await expect(backButton).toBeDisabled();

  await input.press("Enter");

  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${origin}/logo`);
  await expect(backButton).toBeEnabled();

  await backButton.click();

  await expect(page).toHaveURL(`${origin}/`);
  await expect(backButton).toBeDisabled();
  await expect(forwardButton).toBeEnabled();

  await expect(input).toHaveCount(0);
  await expect(display).toHaveValue(`${origin}/`);
});

test("route URL editor previews path suggestions on hover", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const editor = page.getByTestId("route-url-editor");
  const suggestions = page.getByTestId("route-url-editor-suggestions");
  const backButton = editor.getByRole("button", { name: "Back" });
  const forwardButton = editor.getByRole("button", { name: "Forward" });
  const input = await editRouteUrl(page);
  const inputElement = await input.elementHandle();
  if (inputElement === null) {
    throw new Error("Expected route URL editor input element.");
  }
  const logoOption = page.getByRole("option", {
    exact: true,
    name: "Use /logo",
  });

  await input.press("End");
  await input.type("log");

  await expect(logoOption).toBeVisible();
  await expect(page).toHaveURL(`${origin}/`);

  await logoOption.hover();

  await expect(logoOption).toHaveAttribute("aria-selected", "true");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${origin}/logo`);
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(suggestions).toBeVisible();
  await expect(backButton).toBeDisabled();
  expect(
    await inputElement.evaluate(
      (element) => document.activeElement === element && element.isConnected,
    ),
  ).toBe(true);

  await logoOption.click();

  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(backButton).toBeEnabled();
  await backButton.click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(backButton).toBeDisabled();
  await expect(forwardButton).toBeEnabled();
});

test("route URL editor hover previews replace the current history entry", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const editor = page.getByTestId("route-url-editor");
  const backButton = editor.getByRole("button", { name: "Back" });
  const input = await editRouteUrl(page);
  const logoOption = page.getByRole("option", {
    exact: true,
    name: "Use /logo",
  });
  const visualFixtureOption = page.getByRole("option", {
    exact: true,
    name: "Use /visual-fixture",
  });

  await input.press("End");
  await input.type("log");
  await expect(logoOption).toBeVisible();
  await logoOption.hover();
  await logoOption.click();

  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(backButton).toBeEnabled();

  await input.fill(`${origin}/visual`);
  await expect(visualFixtureOption).toBeVisible();
  await visualFixtureOption.hover();

  await expect(page).toHaveURL(`${origin}/visual-fixture`);
  await expect(backButton).toBeEnabled();

  await backButton.click();

  await expect(page).toHaveURL(`${origin}/`);
  await expect(backButton).toBeDisabled();
});

test("route URL editor previews search suggestions on hover", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = await editRouteUrl(page);
  const inputElement = await input.elementHandle();
  if (inputElement === null) {
    throw new Error("Expected route URL editor input element.");
  }
  const suggestions = page.getByTestId("route-url-editor-suggestions");
  const devtoolsOption = page.getByRole("option", {
    exact: true,
    name: "Use ?devtools",
  });

  await input.fill(`${origin}/logo?d`);

  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search");
  await expect(devtoolsOption).toBeVisible();

  await devtoolsOption.hover();

  await expect(devtoolsOption).toHaveAttribute("aria-selected", "true");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${origin}/logo?devtools`);
  await expect(page).toHaveURL(`${origin}/logo?devtools`);
  await expect(suggestions).toBeVisible();
  expect(
    await inputElement.evaluate(
      (element) => document.activeElement === element && element.isConnected,
    ),
  ).toBe(true);
});

test("route URL editor arrow-previews visible routes in the app workspace shell", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const editor = page.getByTestId("route-url-editor");
  const backButton = editor.getByRole("button", { name: "Back" });
  const input = await editRouteUrl(page);
  const inputElement = await input.elementHandle();
  if (inputElement === null) {
    throw new Error("Expected route URL editor input element.");
  }
  const visualFixtureOption = page.getByRole("option", {
    exact: true,
    name: "Use /visual-fixture",
  });

  await input.press("End");
  await input.type("visual");

  await expect(visualFixtureOption).toBeVisible();
  await expect(page).toHaveURL(`${origin}/`);

  await input.press("ArrowDown");

  await expect(visualFixtureOption).toHaveAttribute("aria-selected", "true");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${origin}/visual-fixture`);
  await expect(page).toHaveURL(`${origin}/visual-fixture`);
  expect(
    await inputElement.evaluate(
      (element) => document.activeElement === element && element.isConnected,
    ),
  ).toBe(true);
  await expect(backButton).toBeDisabled();
});

test("route URL editor keeps focus-only arrow previews anchored to all paths", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = await editRouteUrl(page);
  const rootOption = page.getByRole("option", { exact: true, name: "Use /" });
  const localStorageOption = page.getByRole("option", {
    exact: true,
    name: "Use /localStorage",
  });

  await expect(rootOption).toBeVisible();
  await expect(localStorageOption).toBeVisible();

  await input.press("ArrowDown");
  await expect(rootOption).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${origin}/`);
  await expect(input).toHaveValue(`${origin}/`);

  await input.press("ArrowDown");
  await expect(localStorageOption).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${origin}/localStorage`);
  await expect(input).toHaveValue(`${origin}/localStorage`);
});

test("route URL editor hides local route suggestions in prod UI mode", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/?prod-ui", {
    waitUntil: "domcontentloaded",
  });

  const input = await editRouteUrl(page);

  await input.press("Home");

  await expect(page.getByRole("option", { exact: true, name: "Use /logo" })).toBeVisible();
  await expect(page.getByRole("option", { exact: true, name: "Use /visual-fixture" })).toHaveCount(
    0,
  );
});

test("route URL editor fixture refuses changes that remove the origin slash prefix", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = await editRouteUrl(page);
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");

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

  const input = await editRouteUrl(page);
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");

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

  const input = await editRouteUrl(page);

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

  const origin = await page.evaluate(() => window.location.origin);
  const display = getRouteUrlEditorDisplay(page);
  const input = await editRouteUrl(page);
  await input.fill(`${origin}/logo?leftFace=secondary#done`);

  await expect(input).toHaveValue(`${origin}/logo?leftFace=secondary#done`);
  await expect(page).toHaveURL(`${origin}/logo?leftFace=secondary#done`);

  await input.blur();

  await expect(input).toHaveCount(0);
  await expect(display).toHaveValue(`${origin}/logo?leftFace=secondary#done`);
  await expect(page).toHaveURL(`${origin}/logo?leftFace=secondary#done`);
});

test("route URL editor toggles landing dev mode while preserving focused draft text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });

  const display = getRouteUrlEditorDisplay(page);
  const input = getRouteUrlEditorInput(page);
  const origin = await page.evaluate(() => window.location.origin);

  await expect(input).toHaveCount(0);
  await expect(display).toHaveValue(`${origin}/`);
  await display.focus();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${origin}/`);
  await input.press("End");
  await input.type("?dev");

  await expect(input).toHaveValue(`${origin}/?dev`);
  await expect(page).toHaveURL(`${origin}/?dev`);

  await input.press("Backspace");

  await expect(input).toHaveValue(`${origin}/?de`);
  await expect(page).toHaveURL(`${origin}/`);

  await input.blur();

  await expect(input).toHaveCount(0);
  await expect(display).toHaveValue(`${origin}/`);
  await expect(page).toHaveURL(`${origin}/`);
});

test("route URL editor keeps invalid route search drafts local until blur", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/logo?leftFace=secondary", {
    waitUntil: "domcontentloaded",
  });

  const display = getRouteUrlEditorDisplay(page);
  const input = await editRouteUrl(page);
  const origin = await page.evaluate(() => window.location.origin);

  await expect(input).toHaveValue(`${origin}/logo?leftFace=secondary`);

  await input.press("End");
  await input.press("Backspace");

  await expect(input).toHaveValue(`${origin}/logo?leftFace=secondar`);
  await expect(page).toHaveURL(`${origin}/logo`);

  await input.blur();

  await expect(input).toHaveCount(0);
  await expect(display).toHaveValue(`${origin}/logo`);
  await expect(page).toHaveURL(`${origin}/logo`);
});

test("route URL editor fixture refuses pasted external origins", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const display = getRouteUrlEditorDisplay(page);
  const input = await editRouteUrl(page);
  const currentHref = page.getByTestId("route-url-editor-fixture-current-href");

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
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(display).toHaveValue(`${origin}/visual-fixture?mode=route-url-editor`);
});
