import { readFileSync } from "node:fs";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { getLandingMarkdownHeadings } from "../src/lib/landingMarkdownHeadings";

const landingPreviewMarkdown = readFileSync(
  new URL("../src/content/landing-preview.md", import.meta.url),
  "utf8",
);
const landingPreviewHashSuggestions = getLandingMarkdownHeadings(landingPreviewMarkdown).map(
  (heading) => heading.href,
);
const routeUrlEditorMobilePickerScreenshotOptions = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.03,
} as const;

// The local Linux wrapper forces file-level full parallelism; these tests drive
// browser history and focus in the shared route shell, so keep this spec ordered.
test.describe.configure({ mode: "serial" });

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
  const display = getRouteUrlEditorDisplay(page);
  await expect(display).toBeVisible();

  await expect
    .poll(
      async () => {
        if ((await getRouteUrlEditorInput(page).count()) > 0) {
          return true;
        }

        if ((await display.count()) === 0) {
          return false;
        }

        await display.evaluate((element) => {
          if (!(element instanceof HTMLElement)) {
            throw new Error("Expected route URL editor display to be focusable.");
          }

          element.blur();
          element.focus();
        });

        return (await getRouteUrlEditorInput(page).count()) > 0;
      },
      { timeout: 10_000 },
    )
    .toBe(true);

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

async function createMobileRouteUrlEditorPage(
  browser: Browser,
  testInfo: TestInfo,
): Promise<{ context: BrowserContext; page: Page }> {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for route URL editor mobile tests.");
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 680 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    baseURL,
    reducedMotion: "reduce",
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  });

  return {
    context,
    page: await context.newPage(),
  };
}

async function scrollRouteUrlEditorOptionToSlate(page: Page, optionName: string): Promise<void> {
  await page.getByTestId("route-url-editor-suggestions").evaluate((scrollport, targetName) => {
    const slate = document.querySelector('[data-testid="route-url-editor-scroll-slate"]');
    if (!(slate instanceof HTMLElement)) {
      throw new Error("Expected route URL editor scroll slate.");
    }

    let targetOption: HTMLElement | null = null;
    for (const option of scrollport.querySelectorAll<HTMLElement>('[role="option"]')) {
      if (option.getAttribute("aria-label") === targetName) {
        targetOption = option;
        break;
      }
    }
    if (targetOption === null) {
      throw new Error(`Expected route URL editor option ${targetName}.`);
    }

    const targetOptionRect = targetOption.getBoundingClientRect();
    const slateRect = slate.getBoundingClientRect();
    const targetOptionCenterY = targetOptionRect.top + targetOptionRect.height / 2;
    const slateCenterY = slateRect.top + slateRect.height / 2;

    scrollport.scrollTop += targetOptionCenterY - slateCenterY;
    scrollport.dispatchEvent(new Event("scroll", { bubbles: true }));
  }, optionName);
}

async function touchDragRouteUrlEditorSuggestionsByPx(page: Page, deltaY: number): Promise<void> {
  const suggestionsBox = await page.getByTestId("route-url-editor-suggestions").boundingBox();
  if (suggestionsBox === null) {
    throw new Error("Expected route URL editor suggestions to be visible.");
  }
  const popoverBox = await page.getByTestId("route-url-editor-suggestions-popover").boundingBox();
  if (popoverBox === null) {
    throw new Error("Expected route URL editor suggestions popover to be visible.");
  }

  const session = await page.context().newCDPSession(page);
  const gestureStartTimeMs = Date.now();
  const startX = suggestionsBox.x + suggestionsBox.width / 2;
  const startY =
    popoverBox.y + Math.min(popoverBox.height - 12, Math.max(12, popoverBox.height / 2));
  const touchPoint = {
    force: 1,
    id: 1,
    radiusX: 4,
    radiusY: 4,
    x: startX,
    y: startY,
  };

  await session.send("Input.dispatchTouchEvent", {
    timestamp: gestureStartTimeMs / 1000,
    type: "touchStart",
    touchPoints: [touchPoint],
  });

  const stepCount = 6;
  for (let stepIndex = 1; stepIndex <= stepCount; stepIndex += 1) {
    await page.waitForTimeout(16);
    await session.send("Input.dispatchTouchEvent", {
      timestamp: (gestureStartTimeMs + stepIndex * 16) / 1000,
      type: "touchMove",
      touchPoints: [
        {
          ...touchPoint,
          y: startY + (deltaY * stepIndex) / stepCount,
        },
      ],
    });
  }

  await session.send("Input.dispatchTouchEvent", {
    timestamp: (gestureStartTimeMs + (stepCount + 1) * 16) / 1000,
    type: "touchEnd",
    touchPoints: [],
  });
}

async function readRouteUrlEditorScrollSlateGeometry(page: Page): Promise<{
  popoverClassName: string;
  popoverBottomY: number;
  popoverInlineHeight: string;
  selectedCenterY: number;
  slateCenterY: number;
  slateTopY: number;
  scrollportBottomY: number;
  scrollportTopY: number;
  visibleOptionCountAboveSlate: number;
}> {
  return page.getByTestId("route-url-editor-suggestions").evaluate((scrollport) => {
    const slate = document.querySelector('[data-testid="route-url-editor-scroll-slate"]');
    if (!(slate instanceof HTMLElement)) {
      throw new Error("Expected route URL editor scroll slate.");
    }

    const popover = document.querySelector('[data-testid="route-url-editor-suggestions-popover"]');
    if (!(popover instanceof HTMLElement)) {
      throw new Error("Expected route URL editor suggestions popover.");
    }

    const options: HTMLElement[] = [];
    for (const option of scrollport.querySelectorAll<HTMLElement>('[role="option"]')) {
      options.push(option);
    }

    const selectedOption =
      options.find((option) => option.getAttribute("aria-selected") === "true") ?? null;
    if (selectedOption === null) {
      throw new Error("Expected selected route URL editor option.");
    }

    const slateRect = slate.getBoundingClientRect();
    const scrollportRect = scrollport.getBoundingClientRect();
    const selectedOptionRect = selectedOption.getBoundingClientRect();
    let visibleOptionCountAboveSlate = 0;

    for (const option of options) {
      const optionRect = option.getBoundingClientRect();
      if (optionRect.bottom > scrollportRect.top && optionRect.bottom <= slateRect.top) {
        visibleOptionCountAboveSlate += 1;
      }
    }

    return {
      popoverClassName: popover.className,
      popoverBottomY: popover.getBoundingClientRect().bottom,
      popoverInlineHeight: popover.style.height,
      selectedCenterY: selectedOptionRect.top + selectedOptionRect.height / 2,
      slateCenterY: slateRect.top + slateRect.height / 2,
      slateTopY: slateRect.top,
      scrollportBottomY: scrollportRect.bottom,
      scrollportTopY: scrollportRect.top,
      visibleOptionCountAboveSlate,
    };
  });
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
  const refreshButton = page.getByRole("button", { name: "Refresh" });
  await expect(editor).toBeVisible();

  const editorHeight = await editor.evaluate((element) => element.getBoundingClientRect().height);
  expect(editorHeight).toBeGreaterThan(0);
  expect(editorHeight).toBeLessThanOrEqual(40);
  await expect(input).toHaveCount(0);
  await expect(display).toHaveValue(fixtureHref);
  await expect(display).toHaveAttribute("title", fixtureHref);
  await expect(display).toHaveCSS("cursor", "text");
  const displayTextIndent = await display.evaluate((element) => element.style.textIndent);
  expect(displayTextIndent).toBe(`-${origin.length}ch`);
  await expect(currentHref).toHaveText("/visual-fixture?mode=route-url-editor");
  await expect(backButton).toBeVisible();
  await expect(forwardButton).toBeVisible();
  await expect(refreshButton).toBeVisible();
  await expect(page.getByRole("button", { name: "Go to route URL" })).toHaveCount(0);
  await expect(backButton).toBeDisabled();
  await expect(forwardButton).toBeDisabled();
  await expect(refreshButton).toBeEnabled();

  await editRouteUrl(page);
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

test("route URL editor focuses the path-visible URL without rewriting", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/visual-fixture?mode=route-url-editor", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);
  const display = getRouteUrlEditorDisplay(page);
  const fullHref = `${origin}/visual-fixture?mode=route-url-editor`;

  await expect(display).toHaveValue(fullHref);
  const textIndent = await display.evaluate((element) => element.style.textIndent);
  expect(textIndent).toBe(`-${origin.length}ch`);

  const input = await editRouteUrl(page);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(fullHref);
  const focusedTextIndent = await input.evaluate((element) => element.style.textIndent);
  expect(focusedTextIndent).toBe(`-${origin.length}ch`);
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
  await expect(page.getByRole("option", { exact: true, name: "Use /logo/transition" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("option", { exact: true, name: "Use /pricing" })).toHaveCount(0);

  await page.getByRole("option", { exact: true, name: "Use /logo" }).dispatchEvent("click");

  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${origin}/logo?`);
  await expect(suggestions).toBeVisible();
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search");
  await expect(
    page.getByRole("option", { exact: true, name: "Use ?leftFace=secondary" }),
  ).toBeVisible();

  await input.blur();

  await expect(input).toHaveCount(0);
  await expect(display).toHaveValue(`${origin}/logo`);
  await expect(suggestions).toHaveCount(0);
});

test("route URL editor opens search params when clicking the end of a focused route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/logo?leftFace=secondary", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const display = getRouteUrlEditorDisplay(page);
  const suggestions = page.getByTestId("route-url-editor-suggestions");
  await expect(display).toHaveValue(`${origin}/logo?leftFace=secondary`);

  const input = await editRouteUrl(page);
  const focusedInputBox = await input.boundingBox();
  if (focusedInputBox === null) {
    throw new Error("Expected route URL editor input to be visible.");
  }

  await input.click({
    position: {
      x: focusedInputBox.width - 4,
      y: focusedInputBox.height / 2,
    },
  });

  await expect(input).toBeFocused();
  await expect(page).toHaveURL(`${origin}/logo?leftFace=secondary`);
  await expect(input).toHaveValue(`${origin}/logo?leftFace=secondary&`);
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search");
  await expect(page.getByTestId("route-url-editor-suggestion").first()).toHaveAttribute(
    "aria-label",
    /^Use &/,
  );
});

test("route URL editor keeps path suggestions when clicking the end of root", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const display = getRouteUrlEditorDisplay(page);
  const suggestions = page.getByTestId("route-url-editor-suggestions");
  await expect(display).toHaveValue(`${origin}/`);

  const input = await editRouteUrl(page);
  const focusedInputBox = await input.boundingBox();
  if (focusedInputBox === null) {
    throw new Error("Expected route URL editor input to be visible.");
  }

  await input.click({
    position: {
      x: focusedInputBox.width - 4,
      y: focusedInputBox.height / 2,
    },
  });

  await expect(input).toBeFocused();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(input).toHaveValue(`${origin}/`);
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "path");
  await expect(page.getByRole("option", { exact: true, name: "Use /logo" })).toBeVisible();
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

  await input.fill(`${origin}/terms`);

  await expect(page).toHaveURL(`${origin}/terms`);
  await expect(input).toHaveValue(`${origin}/terms`);
  const keptFocusOnTerms = await inputHandle.evaluate(
    (element) => document.activeElement === element && element.isConnected,
  );
  expect(keptFocusOnTerms).toBe(true);

  await input.fill(`${origin}/privacy`);

  await expect(page).toHaveURL(`${origin}/privacy`);
  await expect(input).toHaveValue(`${origin}/privacy`);
  const keptFocusOnPrivacy = await inputHandle.evaluate(
    (element) => document.activeElement === element && element.isConnected,
  );
  expect(keptFocusOnPrivacy).toBe(true);
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
  const rootOption = page.getByRole("option", {
    exact: true,
    name: "Use /",
  });
  const logoOption = page.getByRole("option", {
    exact: true,
    name: "Use /logo",
  });

  await expect(rootOption).toBeVisible();
  await expect(logoOption).toBeVisible();
  const initialEditorLeft = await readRoundedLeft(editor, "route URL editor");
  const initialSuggestionsLeft = await readRoundedLeft(suggestions, "route URL suggestions");

  await input.press("ArrowDown");
  await expect(rootOption).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${origin}/`);
  await expect(input).toHaveValue(`${origin}/`);
  expect(await readRoundedLeft(editor, "route URL editor")).toBe(initialEditorLeft);
  expect(await readRoundedLeft(suggestions, "route URL suggestions")).toBe(initialSuggestionsLeft);
  await expect(backButton).toBeDisabled();

  await input.press("ArrowDown");
  await expect(logoOption).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(input).toHaveValue(`${origin}/logo`);
  expect(await readRoundedLeft(editor, "route URL editor")).toBe(initialEditorLeft);
  expect(await readRoundedLeft(suggestions, "route URL suggestions")).toBe(initialSuggestionsLeft);
  await expect(backButton).toBeDisabled();

  await input.press("ArrowUp");
  await expect(rootOption).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${origin}/`);
  await expect(input).toHaveValue(`${origin}/`);
  expect(await readRoundedLeft(editor, "route URL editor")).toBe(initialEditorLeft);
  expect(await readRoundedLeft(suggestions, "route URL suggestions")).toBe(initialSuggestionsLeft);
  await expect(backButton).toBeDisabled();

  await input.press("ArrowDown");
  await expect(logoOption).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");

  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${origin}/logo?`);
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search");
  await expect(backButton).toBeEnabled();

  await input.blur();
  await expect(display).toHaveValue(`${origin}/logo`);
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

test("route URL editor restores history controls after hard refresh", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const editor = page.getByTestId("route-url-editor");
  const backButton = editor.getByRole("button", { name: "Back" });
  const forwardButton = editor.getByRole("button", { name: "Forward" });
  const input = await editRouteUrl(page);

  await input.fill(`${origin}/logo`);
  await expect(page).toHaveURL(`${origin}/logo`);
  await input.press("Enter");
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(backButton).toBeEnabled();
  await expect(forwardButton).toBeDisabled();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(backButton).toBeEnabled();
  await expect(forwardButton).toBeDisabled();

  await backButton.click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(backButton).toBeDisabled();
  await expect(forwardButton).toBeEnabled();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(`${origin}/`);
  await expect(backButton).toBeDisabled();
  await expect(forwardButton).toBeEnabled();

  await forwardButton.click();
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(backButton).toBeEnabled();
  await expect(forwardButton).toBeDisabled();
});

test("route URL editor restores the typed draft after leaving a hovered dropdown option", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = await editRouteUrl(page);
  const suggestions = page.getByTestId("route-url-editor-suggestions");
  const secondaryOption = page.getByRole("option", {
    exact: true,
    name: "Use secondary",
  });

  await input.fill(`${origin}/logo?leftFace=`);

  await expect(input).toHaveValue(`${origin}/logo?leftFace=`);
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search-value");
  await expect(secondaryOption).toBeVisible();

  await secondaryOption.hover();

  await expect(secondaryOption).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveValue(`${origin}/logo?leftFace=secondary`);
  await expect(page).toHaveURL(`${origin}/logo?leftFace=secondary`);

  await page.mouse.move(10, 10);

  await expect(secondaryOption).toHaveAttribute("aria-selected", "false");
  await expect(input).toHaveValue(`${origin}/logo?leftFace=`);
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(suggestions).toBeVisible();
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
  await logoOption.dispatchEvent("click");

  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(backButton).toBeEnabled();

  await input.fill(`${origin}/visual`);
  await expect(visualFixtureOption).toBeVisible();
  await visualFixtureOption.hover();

  await expect(page).toHaveURL(`${origin}/visual-fixture`);
  await expect(backButton).toBeEnabled();

  await page.mouse.move(10, 10);

  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(backButton).toBeEnabled();

  await input.press("Escape");
  await expect(getRouteUrlEditorDisplay(page)).toHaveValue(`${origin}/logo`);

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

test("@diagnostic route URL editor previews numeric search examples from the dropdown on hover", async ({
  page,
}) => {
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
  const nextDepthOption = page.getByRole("option", {
    exact: true,
    name: "Use ?depth=2 1 +1",
  });

  await input.fill(`${origin}/logo?d`);

  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search");
  await expect(page.getByRole("option")).toHaveCount(5);
  await expect(nextDepthOption).toBeVisible();
  await expect(nextDepthOption).toContainText("1 +1");
  await expect(suggestions).toHaveScreenshot("route-url-editor-numeric-delta-suggestions.png", {
    animations: "disabled",
  });

  await nextDepthOption.hover();

  await expect(nextDepthOption).toHaveAttribute("aria-selected", "true");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${origin}/logo?depth=2`);
  await expect(page).toHaveURL(`${origin}/logo?depth=2`);
  await expect(suggestions).toBeVisible();
  expect(
    await inputElement.evaluate(
      (element) => document.activeElement === element && element.isConnected,
    ),
  ).toBe(true);
});

test("@diagnostic route URL editor previews color samples from composed value options", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = await editRouteUrl(page);
  const suggestions = page.getByTestId("route-url-editor-suggestions");
  const emeraldOption = page.getByRole("option", {
    exact: true,
    name: "Use emerald-500",
  });

  await input.fill(`${origin}/logo?primary=em`);

  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search-value");
  await expect(emeraldOption).toBeVisible();
  await expect(suggestions).toHaveScreenshot("route-url-editor-color-sample-suggestions.png", {
    animations: "disabled",
  });

  await emeraldOption.hover();

  await expect(emeraldOption).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveValue(`${origin}/logo?primary=emerald-500`);
  await expect(page).toHaveURL(`${origin}/logo?primary=emerald-500`);
});

test("route URL editor continues with a new search param after Enter commits a value", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const editor = page.getByTestId("route-url-editor");
  const input = await editRouteUrl(page);
  const suggestions = page.getByTestId("route-url-editor-suggestions");
  const backButton = editor.getByRole("button", { name: "Back" });
  const secondaryOption = page.getByRole("option", {
    exact: true,
    name: "Use secondary",
  });
  const nextSearchSuggestion = page.getByTestId("route-url-editor-suggestion").first();

  await input.fill(`${origin}/logo?leftFace=s`);
  await expect(secondaryOption).toBeVisible();

  await input.press("ArrowDown");

  await expect(secondaryOption).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveValue(`${origin}/logo?leftFace=secondary`);
  await expect(page).toHaveURL(`${origin}/logo?leftFace=secondary`);
  await expect(backButton).toBeDisabled();

  await input.press("Enter");

  await expect(page).toHaveURL(`${origin}/logo?leftFace=secondary`);
  await expect(input).toHaveValue(`${origin}/logo?leftFace=secondary&`);
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search");
  await expect(nextSearchSuggestion).toHaveAttribute("aria-label", /^Use &/);
  await expect(backButton).toBeEnabled();

  await backButton.click();

  await expect(page).toHaveURL(`${origin}/logo`);
});

test("route URL editor continues with a new search param after Enter commits a key-only param", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const editor = page.getByTestId("route-url-editor");
  const input = await editRouteUrl(page);
  const suggestions = page.getByTestId("route-url-editor-suggestions");
  const backButton = editor.getByRole("button", { name: "Back" });
  const devtoolsOption = page.getByRole("option", {
    exact: true,
    name: "Use ?devtools",
  });
  const nextSearchSuggestion = page.getByTestId("route-url-editor-suggestion").first();

  await input.fill(`${origin}/logo?devt`);
  await expect(devtoolsOption).toBeVisible();

  await input.press("ArrowDown");

  await expect(devtoolsOption).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveValue(`${origin}/logo?devtools`);
  await expect(page).toHaveURL(`${origin}/logo?devtools`);
  await expect(backButton).toBeDisabled();

  await input.press("Enter");

  await expect(page).toHaveURL(`${origin}/logo?devtools`);
  await expect(input).toHaveValue(`${origin}/logo?devtools&`);
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search");
  await expect(nextSearchSuggestion).toHaveAttribute("aria-label", /^Use &/);
  await expect(backButton).toBeEnabled();

  await backButton.click();

  await expect(page).toHaveURL(`${origin}/logo`);
});

test("route URL editor keeps clicked follow-up search params in the query", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = await editRouteUrl(page);
  const suggestions = page.getByTestId("route-url-editor-suggestions");
  const logoOption = page.getByRole("option", {
    exact: true,
    name: "Use /logo",
  });

  await logoOption.dispatchEvent("click");

  await expect(input).toHaveValue(`${origin}/logo?`);
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search");

  const borderOption = page.getByRole("option", {
    exact: true,
    name: "Use ?border=stone-300",
  });
  await borderOption.dispatchEvent("click");

  await expect(input).toHaveValue(`${origin}/logo?border=`);
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search-value");

  const stoneFamilyOption = page.getByRole("option", {
    exact: true,
    name: "Use stone-500",
  });
  await stoneFamilyOption.dispatchEvent("click");

  await expect(input).toHaveValue(`${origin}/logo?border=stone-`);
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search-value");

  const stone300Option = page.getByRole("option", {
    exact: true,
    name: "Use 300",
  });
  await stone300Option.hover();

  await expect(input).toHaveValue(`${origin}/logo?border=stone-300`);
  await expect(page).toHaveURL(`${origin}/logo?border=stone-300`);

  await stone300Option.dispatchEvent("click");

  await expect(input).toHaveValue(`${origin}/logo?border=stone-300&`);
  await expect(page).toHaveURL(`${origin}/logo?border=stone-300`);
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search");

  const darkOption = page.getByRole("option", {
    exact: true,
    name: "Use &dark",
  });
  await darkOption.hover();

  await expect(input).toHaveValue(`${origin}/logo?border=stone-300&dark`);
  await expect(page).toHaveURL(`${origin}/logo?border=stone-300&dark`);

  await darkOption.dispatchEvent("click");

  await expect(input).toHaveValue(`${origin}/logo?border=stone-300&dark&`);
  await expect(page).toHaveURL(`${origin}/logo?border=stone-300&dark`);
  await expect(suggestions).toHaveAttribute("data-suggestion-kind", "search");
});

test("route URL editor keeps unfinished valued search params local", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = await editRouteUrl(page);
  const rotOption = page.getByRole("option", {
    exact: true,
    name: "Use ?rot=46 45 +1",
  });

  await input.press("End");
  await input.type("?rot=");

  await expect(input).toHaveValue(`${origin}/logo?rot=`);
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(input).toHaveJSProperty("selectionStart", `${origin}/logo?rot=`.length);
  await expect(input).toHaveJSProperty("selectionEnd", `${origin}/logo?rot=`.length);

  await input.press("Backspace");

  await expect(input).toHaveValue(`${origin}/logo?rot`);
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(rotOption).toBeVisible();

  await input.type("=10");

  await expect(input).toHaveValue(`${origin}/logo?rot=10`);
  await expect(page).toHaveURL(`${origin}/logo?rot=10`);
});

test("route URL editor waits for pointer movement before hover-previewing keyboard-created suggestions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 420 });
  await page.goto("/logo?dev", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);

  const input = await editRouteUrl(page);
  const distOption = page.getByRole("option", {
    exact: true,
    name: "Use &dist=2 1 +1",
  });
  const nextDistOption = page.getByRole("option", {
    exact: true,
    name: "Use &dist=2 1 +1",
  });

  await input.fill(`${origin}/logo?dev&dist=`);

  await expect(input).toHaveValue(`${origin}/logo?dev&dist=`);

  for (let index = 0; index < 4; index += 1) {
    await input.press("Backspace");
  }

  await expect(input).toHaveValue(`${origin}/logo?dev&d`);
  await expect(page).toHaveURL(`${origin}/logo?dev`);
  await expect(distOption).toBeVisible();

  await distOption.dispatchEvent("mouseover");

  await expect(input).toHaveValue(`${origin}/logo?dev&d`);
  await expect(page).toHaveURL(`${origin}/logo?dev`);

  await distOption.click();

  await expect(input).toHaveValue(`${origin}/logo?dev&dist=`);
  await expect(page).toHaveURL(`${origin}/logo?dev`);

  await input.fill(`${origin}/logo?dev&d`);
  await expect(nextDistOption).toBeVisible();

  const distOptionBox = await nextDistOption.boundingBox();
  if (distOptionBox === null) {
    throw new Error("Expected dist suggestion to be visible.");
  }
  await page.mouse.move(distOptionBox.x + distOptionBox.width / 2, distOptionBox.y + 1);

  await expect(nextDistOption).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveValue(`${origin}/logo?dev&dist=2`);
  await expect(page).toHaveURL(`${origin}/logo?dev&dist=2`);
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
  const logoOption = page.getByRole("option", {
    exact: true,
    name: "Use /logo",
  });
  const privacyOption = page.getByRole("option", {
    exact: true,
    name: "Use /privacy",
  });

  await expect(rootOption).toBeVisible();
  await expect(logoOption).toBeVisible();
  await expect(privacyOption).toBeVisible();
  await expect(page.getByRole("option", { exact: true, name: "Use /indexDB" })).toHaveCount(0);
  await expect(page.getByRole("option", { exact: true, name: "Use /localStorage" })).toHaveCount(0);

  await input.press("ArrowDown");
  await expect(rootOption).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${origin}/`);
  await expect(input).toHaveValue(`${origin}/`);

  await input.press("ArrowDown");
  await expect(logoOption).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${origin}/logo`);
  await expect(input).toHaveValue(`${origin}/logo`);

  await input.press("ArrowDown");
  await expect(privacyOption).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(`${origin}/privacy`);
  await expect(input).toHaveValue(`${origin}/privacy`);
});

test("route URL editor mobile scroll picker previews and commits the slated option", async ({
  browser,
}, testInfo) => {
  const { context, page } = await createMobileRouteUrlEditorPage(browser, testInfo);
  try {
    await page.goto("/", {
      waitUntil: "domcontentloaded",
    });
    const origin = await page.evaluate(() => window.location.origin);

    const editor = page.getByTestId("route-url-editor");
    const input = await editRouteUrl(page);
    const suggestions = page.getByTestId("route-url-editor-suggestions");
    const popover = page.getByTestId("route-url-editor-suggestions-popover");
    const slate = page.getByTestId("route-url-editor-scroll-slate");
    const termsOption = page.getByRole("option", {
      exact: true,
      name: "Use /terms",
    });
    const backButton = editor.getByRole("button", { name: "Back" });

    await expect(suggestions).toBeVisible();
    await expect(slate).toBeVisible();
    await expect(termsOption).toBeVisible();

    await scrollRouteUrlEditorOptionToSlate(page, "Use /terms");

    await expect(termsOption).toHaveAttribute("aria-selected", "true");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(`${origin}/terms`);
    await expect(page).toHaveURL(`${origin}/terms`);
    await expect(backButton).toBeDisabled();
    await expect(popover).toHaveScreenshot(
      "route-url-editor-mobile-scroll-picker-preview.png",
      routeUrlEditorMobilePickerScreenshotOptions,
    );

    await page.getByTestId("workspace-layout-v2-pane-main").tap();

    await expect(input).toHaveCount(0);
    await expect(suggestions).toHaveCount(0);
    await expect(getRouteUrlEditorDisplay(page)).toHaveValue(`${origin}/terms`);
    await expect(backButton).toBeEnabled();

    await backButton.click();

    await expect(page).toHaveURL(`${origin}/`);
    await expect(backButton).toBeDisabled();
  } finally {
    await context.close();
  }
});

test("route URL editor mobile input avoids iOS focus zoom text sizing", async ({
  browser,
}, testInfo) => {
  const { context, page } = await createMobileRouteUrlEditorPage(browser, testInfo);
  try {
    await page.goto("/", {
      waitUntil: "domcontentloaded",
    });

    const display = getRouteUrlEditorDisplay(page);
    await expect(display).toHaveCSS("font-size", "16px");

    const input = await editRouteUrl(page);
    await expect(input).toHaveCSS("font-size", "16px");
  } finally {
    await context.close();
  }
});

test("route URL editor mobile scroll picker lets the last option reach the slate", async ({
  browser,
}, testInfo) => {
  const { context, page } = await createMobileRouteUrlEditorPage(browser, testInfo);
  try {
    await page.goto("/", {
      waitUntil: "domcontentloaded",
    });

    await editRouteUrl(page);
    const slate = page.getByTestId("route-url-editor-scroll-slate");
    const lastOption = page.getByTestId("route-url-editor-suggestion").last();

    await expect(slate).toBeVisible();
    await expect(lastOption).toBeVisible();

    for (let dragIndex = 0; dragIndex < 3; dragIndex += 1) {
      await touchDragRouteUrlEditorSuggestionsByPx(page, -360);
    }

    await expect(lastOption).toHaveAttribute("aria-selected", "true");
    const geometry = await readRouteUrlEditorScrollSlateGeometry(page);

    expect(Math.round(geometry.slateTopY - geometry.scrollportTopY)).toBe(28);
    expect(Math.abs(geometry.selectedCenterY - geometry.slateCenterY)).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.popoverBottomY - geometry.scrollportBottomY)).toBeLessThanOrEqual(2);
    expect(geometry.popoverInlineHeight).toBe("");
    expect(geometry.popoverClassName).toContain("bg-background/35");
    expect(geometry.popoverClassName).toContain("backdrop-blur-sm");
    expect(geometry.visibleOptionCountAboveSlate).toBeGreaterThan(0);
    await expect(page.getByTestId("route-url-editor-suggestions-popover")).toHaveScreenshot(
      "route-url-editor-mobile-scroll-picker-last-option.png",
      routeUrlEditorMobilePickerScreenshotOptions,
    );
  } finally {
    await context.close();
  }
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

test("route URL editor deletes selected route text across the origin boundary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);
  const routeInputPrefix = `${origin}/`;

  const input = await editRouteUrl(page);

  await expect(input).toHaveValue(`${routeInputPrefix}logo`);

  await input.evaluate((element, currentOrigin) => {
    element.setSelectionRange(currentOrigin.length - 2, `${currentOrigin}/l`.length);
  }, origin);
  await input.press("Backspace");

  await expect(input).toHaveValue(`${routeInputPrefix}ogo`);
  await expect(input).toHaveJSProperty("selectionStart", routeInputPrefix.length);
  await expect(input).toHaveJSProperty("selectionEnd", routeInputPrefix.length);
  await expect(input).toHaveAttribute("aria-invalid", "false");
});

test("route URL editor deletes selected route text across the root slash", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);
  const routeInputPrefix = `${origin}/`;

  const input = await editRouteUrl(page);

  await expect(input).toHaveValue(`${routeInputPrefix}logo`);

  await input.evaluate((element, currentOrigin) => {
    element.setSelectionRange(currentOrigin.length, `${currentOrigin}/l`.length);
  }, origin);
  await input.press("Delete");

  await expect(input).toHaveValue(`${routeInputPrefix}ogo`);
  await expect(input).toHaveJSProperty("selectionStart", routeInputPrefix.length);
  await expect(input).toHaveJSProperty("selectionEnd", routeInputPrefix.length);
  await expect(input).toHaveAttribute("aria-invalid", "false");
});

test("route URL editor collapses select-all deletion to the route boundary", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 96 });
  await page.goto("/logo", {
    waitUntil: "domcontentloaded",
  });
  const origin = await page.evaluate(() => window.location.origin);
  const routeInputPrefix = `${origin}/`;

  const input = await editRouteUrl(page);

  await expect(input).toHaveValue(`${routeInputPrefix}logo`);

  await input.evaluate((element) => {
    element.setSelectionRange(0, element.value.length);
  });
  await input.press("Backspace");

  await expect(input).toHaveValue(routeInputPrefix);
  await expect(input).toHaveJSProperty("selectionStart", routeInputPrefix.length);
  await expect(input).toHaveJSProperty("selectionEnd", routeInputPrefix.length);
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await expect(page).toHaveURL(`${origin}/`);
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
  const origin = await page.evaluate(() => window.location.origin);

  await expect(getRouteUrlEditorInput(page)).toHaveCount(0);
  await expect(display).toHaveValue(`${origin}/`);
  const input = await editRouteUrl(page);
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
