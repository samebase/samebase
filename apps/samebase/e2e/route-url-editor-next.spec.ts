import { expect, test, type Locator, type Page } from "@playwright/test";
import { openRouteAddressQuerySlot } from "../src/routing/addressParts";

async function openRouteUrlEditor(page: Page, route = "/privacy"): Promise<Locator> {
  await page.goto(route, {
    waitUntil: "domcontentloaded",
  });

  const input = page.getByTestId("route-url-editor-display");
  await expect(input).toBeVisible();

  return input;
}

async function readRouteAddressPrefix(page: Page): Promise<string> {
  return page.evaluate(() => `${window.location.origin}/`);
}

function readDisplayRouteAddress(route: string): string {
  return route.startsWith("/") ? route : `/${route}`;
}

async function setInputSelection(
  input: Locator,
  selection: {
    end: number;
    start: number;
  },
): Promise<void> {
  await input.evaluate((element, nextSelection) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error("Expected route URL editor input.");
    }
    element.focus();
    element.setSelectionRange(nextSelection.start, nextSelection.end);
    element.dispatchEvent(new Event("select", { bubbles: true }));
  }, selection);

  await expect(input).toHaveJSProperty("selectionStart", selection.start);
  await expect(input).toHaveJSProperty("selectionEnd", selection.end);
}

async function expectInputSelection(input: Locator, position: number): Promise<void> {
  await expect(input).toHaveJSProperty("selectionStart", position);
  await expect(input).toHaveJSProperty("selectionEnd", position);
}

async function expectInputSelectionAfterRouteText(
  input: Locator,
  prefix: string,
  routeTextBeforeCursor: string,
): Promise<void> {
  await expectInputSelection(input, prefix.length + routeTextBeforeCursor.length - 1);
}

async function expectNoPageErrorDuring(page: Page, action: () => Promise<void>): Promise<void> {
  const errors: Error[] = [];
  const rememberError = (error: Error) => {
    errors.push(error);
  };

  page.on("pageerror", rememberError);
  try {
    await action();
    await page.waitForTimeout(0);
  } finally {
    page.off("pageerror", rememberError);
  }

  expect(errors.map((error) => error.message)).toEqual([]);
}

async function dispatchRouteAddressInputValue(input: Locator, value: string): Promise<void> {
  await input.evaluate((element, nextValue) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error("Expected route URL editor input.");
    }

    const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (!valueDescriptor?.set) {
      throw new Error("Expected native input value setter.");
    }

    valueDescriptor.set.call(element, nextValue);
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }, value);
}

async function pushBrowserRoute(page: Page, route: string): Promise<void> {
  await page.evaluate((nextRoute) => {
    window.history.pushState(window.history.state, "", nextRoute);
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  }, route);
}

async function focusRouteAddressInput(page: Page, route = "/privacy") {
  const displayInput = await openRouteUrlEditor(page, route);
  const prefix = await readRouteAddressPrefix(page);
  const displayRouteAddress = readDisplayRouteAddress(route);
  const focusedRouteAddress = openRouteAddressQuerySlot(displayRouteAddress).routeAddress;
  const focusedInputValue = `${prefix}${focusedRouteAddress.slice(1)}`;

  await expect(displayInput).toHaveValue(displayRouteAddress);
  const input = page.getByTestId("route-url-editor-input");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
      break;
    }

    await page.keyboard.press("Tab");
    if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
      break;
    }

    if (await displayInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await displayInput.click();
    }

    if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
      break;
    }
  }

  await expect(input).toHaveValue(focusedInputValue, { timeout: 30_000 });
  await input.focus();
  await expect(input).toBeFocused();

  return {
    focusedInputValue,
    input,
    prefix,
  };
}

async function focusRouteAddressInputDirectly(page: Page, route = "/privacy") {
  const displayInput = await openRouteUrlEditor(page, route);
  const prefix = await readRouteAddressPrefix(page);
  const displayRouteAddress = readDisplayRouteAddress(route);
  const focusedRouteAddress = openRouteAddressQuerySlot(displayRouteAddress).routeAddress;
  const focusedInputValue = `${prefix}${focusedRouteAddress.slice(1)}`;

  await expect(displayInput).toHaveValue(displayRouteAddress);

  const input = page.getByTestId("route-url-editor-input");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
      break;
    }

    await page.keyboard.press("Tab");
    if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
      break;
    }

    if (await displayInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await displayInput.click();
    }

    if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
      break;
    }
  }

  await expect(input).toHaveValue(focusedInputValue);
  await input.focus();
  await expect(input).toBeFocused();

  return {
    input,
    prefix,
  };
}

async function focusRouteAddressInputAtRouteText(
  page: Page,
  route: string,
  routeTextBeforeCursor: string,
) {
  const { input, prefix } = await focusRouteAddressInputDirectly(page, route);
  const position = prefix.length + routeTextBeforeCursor.length - 1;
  const keyboardStartPosition = Math.max(prefix.length, position - 1);

  await setInputSelection(input, {
    end: keyboardStartPosition,
    start: keyboardStartPosition,
  });
  if (keyboardStartPosition < position) {
    await input.press("ArrowRight");
  }
  await expectInputSelection(input, position);

  return {
    input,
    prefix,
  };
}

async function expectPrivacyPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
}

async function expectTermsPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
}

async function clickOutsideRouteUrlEditor(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error("Route URL editor outside click needs a measured viewport.");
  }

  await page.mouse.click(viewport.width / 2, viewport.height - 24);
}

async function pressArrowDownToSuggestion(
  page: Page,
  input: Locator,
  suggestionValue: string,
): Promise<Locator> {
  const suggestions = page.getByTestId("route-url-editor-suggestion");
  await expect(page.getByRole("option", { exact: true, name: suggestionValue })).toBeVisible();

  const suggestionValues = (
    await page.getByTestId("route-url-editor-suggestion-value").allTextContents()
  ).map((value) => value.trim());
  const suggestionIndex = suggestionValues.indexOf(suggestionValue);

  expect(suggestionIndex).toBeGreaterThanOrEqual(0);

  for (let step = 0; step <= suggestionIndex; step += 1) {
    await input.press("ArrowDown");
  }

  const suggestion = suggestions.nth(suggestionIndex);
  await expect(suggestion).toHaveAttribute("aria-selected", "true");

  const suggestionId = await suggestion.getAttribute("id");
  if (!suggestionId) {
    throw new Error("Expected active route URL editor suggestion id.");
  }

  await expect(input).toHaveAttribute("aria-activedescendant", suggestionId);

  return suggestion;
}

async function scrollTouchPickerToSuggestion(
  page: Page,
  suggestionValue: string,
): Promise<Locator> {
  const suggestions = page.getByTestId("route-url-editor-suggestion");
  await expect(page.getByRole("option", { exact: true, name: suggestionValue })).toBeVisible();

  const suggestionValues = (
    await page.getByTestId("route-url-editor-suggestion-value").allTextContents()
  ).map((value) => value.trim());
  const suggestionIndex = suggestionValues.indexOf(suggestionValue);

  expect(suggestionIndex).toBeGreaterThanOrEqual(0);

  const nextScrollTop = await suggestions.nth(suggestionIndex).evaluate((element) => {
    const slate = document.querySelector('[data-testid="route-url-editor-scroll-slate"]');
    const scrollport = document.querySelector('[data-testid="route-url-editor-suggestions"]');
    if (!(slate instanceof HTMLElement) || !(scrollport instanceof HTMLElement)) {
      throw new Error("Expected route URL editor touch picker.");
    }

    return (
      scrollport.scrollTop + element.getBoundingClientRect().top - slate.getBoundingClientRect().top
    );
  });

  await scrollTouchPickerTo(page, nextScrollTop);

  return suggestions.nth(suggestionIndex);
}

async function readTouchSlateSuggestionAlignment(page: Page, suggestionValue: string) {
  return page.evaluate((value) => {
    const slate = document.querySelector('[data-testid="route-url-editor-scroll-slate"]');
    const scrollport = document.querySelector('[data-testid="route-url-editor-suggestions"]');
    if (!(slate instanceof HTMLElement) || !(scrollport instanceof HTMLElement)) {
      throw new Error("Expected route URL editor touch picker.");
    }

    const suggestions: HTMLElement[] = [];
    for (const element of document.querySelectorAll(
      '[data-testid="route-url-editor-suggestion"]',
    )) {
      if (element instanceof HTMLElement) {
        suggestions.push(element);
      }
    }

    const suggestionIndex = suggestions.findIndex((element) => {
      const suggestionValue = element.querySelector(
        '[data-testid="route-url-editor-suggestion-value"]',
      );
      return suggestionValue?.textContent?.trim() === value;
    });
    const suggestion = suggestions[suggestionIndex];
    if (!suggestion) {
      throw new Error(`Expected route URL editor suggestion: ${value}`);
    }

    return {
      differencePx: suggestion.getBoundingClientRect().top - slate.getBoundingClientRect().top,
      expectedScrollTop:
        scrollport.scrollTop +
        suggestion.getBoundingClientRect().top -
        slate.getBoundingClientRect().top,
      flatSuggestionIndex: suggestion.getAttribute("data-route-url-editor-suggestion-index"),
      scrollTop: scrollport.scrollTop,
    };
  }, suggestionValue);
}

async function expectTouchSlateAlignedToSuggestion(
  page: Page,
  suggestionValue: string,
): Promise<void> {
  await expect(page.getByRole("option", { exact: true, name: suggestionValue })).toBeVisible();

  await expect
    .poll(async () => {
      const alignment = await readTouchSlateSuggestionAlignment(page, suggestionValue);
      return Math.abs(alignment.differencePx);
    })
    .toBeLessThanOrEqual(1);

  const alignment = await readTouchSlateSuggestionAlignment(page, suggestionValue);
  expect(Math.abs(alignment.scrollTop - alignment.expectedScrollTop)).toBeLessThanOrEqual(1);
  expect(alignment.flatSuggestionIndex).not.toBeNull();
}

async function scrollTouchPickerTo(page: Page, scrollTop: number): Promise<void> {
  await page
    .getByTestId("route-url-editor-suggestions")
    .evaluate(async (element, nextScrollTop) => {
      element.dispatchEvent(new Event("touchstart", { bubbles: true }));
      element.scrollTop = nextScrollTop;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
    }, scrollTop);
}

test.describe("route URL editor touch scroll picker", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: {
      height: 844,
      width: 390,
    },
  });

  test("mobile focus keeps the tapped editable input mounted while opening edit mode", async ({
    page,
  }) => {
    const displayInput = await openRouteUrlEditor(page, "/");
    const prefix = await readRouteAddressPrefix(page);

    await expect(displayInput).toHaveJSProperty("readOnly", false);
    await displayInput.evaluate((element) => {
      element.setAttribute("data-route-editor-node-marker", "before-touch-focus");
    });

    await displayInput.tap();

    const input = page.getByTestId("route-url-editor-input");
    await expect(input).toBeFocused({ timeout: 30_000 });
    await expect(input).toHaveValue(prefix);
    await expect(input).toHaveJSProperty("readOnly", false);
    await expect(input).toHaveAttribute("data-route-editor-node-marker", "before-touch-focus");
  });

  test("mobile focus scrolls query-key suggestions to the current query key", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputAtRouteText(
      page,
      "/logo?depth=2",
      "/logo?de",
    );

    await expect(input).toBeFocused();
    await expectInputSelectionAfterRouteText(input, prefix, "/logo?de");
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
    await expect(page).toHaveURL(/\/logo\?depth=2$/);
    await expectTouchSlateAlignedToSuggestion(page, "?depth=2");
  });

  test("mobile focus scrolls value suggestions to the current query value", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputAtRouteText(
      page,
      "/logo?top=blue-200",
      "/logo?top=blue-",
    );

    await expect(input).toBeFocused();
    await expectInputSelectionAfterRouteText(input, prefix, "/logo?top=blue-");
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
    await expect(page).toHaveURL(/\/logo\?top=blue-200$/);
    await expectTouchSlateAlignedToSuggestion(page, "200");
  });

  test("touch path suggestion lists use the same scroll picker", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/");

    await expect(input).toHaveValue(prefix);
    await expect(page.getByTestId("route-url-editor-scroll-slate")).toBeVisible();
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);

    await scrollTouchPickerTo(page, 13);

    await expect(input).toHaveValue(prefix);
    await expect(page).toHaveURL(/\/$/);

    const logoSuggestion = await scrollTouchPickerToSuggestion(page, "/logo");

    await expect(input).toHaveValue(`${prefix}logo?`);
    await expectInputSelection(input, prefix.length);
    await expect(page).toHaveURL(/\/logo$/);
    await expect(page.getByTestId("route-url-editor-scroll-slate")).toBeVisible();

    const logoSuggestionBox = await logoSuggestion.boundingBox();
    if (!logoSuggestionBox) {
      throw new Error("Expected visible /logo suggestion.");
    }

    await page.touchscreen.tap(
      logoSuggestionBox.x + logoSuggestionBox.width / 2,
      logoSuggestionBox.y + logoSuggestionBox.height / 2,
    );

    await expect(input).toHaveValue(`${prefix}logo?`);
    await expect(page).toHaveURL(/\/logo$/);
    await expectInputSelection(input, `${prefix}logo?`.length);
    await expect(page.getByRole("option", { exact: true, name: "?top=sky-500" })).toBeVisible();
  });

  test("touch path suggestions distinguish developer logo routes @logo-research", async ({
    page,
  }) => {
    await focusRouteAddressInputDirectly(page, "/");
    await expect(page.getByRole("option", { exact: true, name: "/logo/iso" })).toHaveCount(0);

    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/?dev");
    await setInputSelection(input, {
      end: prefix.length,
      start: prefix.length,
    });
    await input.evaluate((element) => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const developerSuggestion = page.getByRole("option", {
      exact: true,
      name: "/logo/iso",
    });
    const developerBadge = developerSuggestion.getByText("dev", { exact: true });
    const standardSuggestion = page.getByRole("option", {
      exact: true,
      name: "/logo",
    });

    await expect(developerSuggestion).toBeVisible();
    await expect(developerSuggestion).toHaveClass(/bg-sky-500\/5/);
    await expect(developerBadge).toBeVisible();
    await expect(developerBadge).toHaveAttribute("aria-hidden", "true");
    await expect(standardSuggestion.getByText("dev", { exact: true })).toHaveCount(0);

    await scrollTouchPickerToSuggestion(page, "/logo/iso");

    await expect(input).toHaveValue(`${prefix}logo/iso?dev&`);
    await expectTouchSlateAlignedToSuggestion(page, "/logo/iso");
    await expect(page).toHaveURL(/\/logo\/iso\?dev$/);
  });

  test("touch scroll keeps query-key suggestions anchored until tap", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

    await input.press("End");
    const suggestionList = page.getByTestId("route-url-editor-suggestions");
    const themeGroup = suggestionList.getByRole("group", { name: "Theme" });
    const logoGroup = suggestionList.getByRole("group", { name: "Logo", exact: true });
    const logoMotionGroup = suggestionList.getByRole("group", { name: "Logo motion" });
    const logoViewGroup = suggestionList.getByRole("group", { name: "Logo view" });
    const suggestions = suggestionList.getByRole("option");
    await expect(themeGroup.getByText("Theme", { exact: true })).toBeVisible();
    await expect(themeGroup.getByRole("option", { exact: true, name: "?dark" })).toBeVisible();
    await expect(
      logoGroup.getByRole("option", { exact: true, name: "?top=sky-500" }),
    ).toBeVisible();
    await expect(
      logoMotionGroup.getByRole("option", { exact: true, name: "?auto-rotate" }),
    ).toBeVisible();
    await expect(logoViewGroup.getByRole("option", { exact: true, name: "?rot=46" })).toBeVisible();
    await expect(page.getByTestId("route-url-editor-scroll-slate")).toBeVisible();
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
    expect(
      await suggestions.evaluateAll((options) =>
        options.map((option) => option.getAttribute("data-route-url-editor-suggestion-index")),
      ),
    ).toEqual(await suggestions.evaluateAll((options) => options.map((_, index) => `${index}`)));
    await expectTouchSlateAlignedToSuggestion(page, "?reset");

    await scrollTouchPickerToSuggestion(page, "?auto-rotate");
    await expect(input).toHaveValue(`${prefix}logo?auto-rotate&`);
    await expectTouchSlateAlignedToSuggestion(page, "?auto-rotate");

    await scrollTouchPickerToSuggestion(page, "?zoom=0.5");
    await expect(input).toHaveValue(`${prefix}logo?zoom=0.5`);
    await expectTouchSlateAlignedToSuggestion(page, "?zoom=0.5");

    const topSuggestion = await scrollTouchPickerToSuggestion(page, "?top=sky-500");

    await expect(input).toHaveValue(`${prefix}logo?top=sky-500`);
    await expectTouchSlateAlignedToSuggestion(page, "?top=sky-500");
    await expectInputSelection(input, `${prefix}logo?`.length);
    await expect(page).toHaveURL(/\/logo\?top=sky-500$/);
    await expect(page.getByTestId("route-url-editor-scroll-slate")).toBeVisible();
    await expect(page.getByRole("option", { exact: true, name: "?top=sky-500" })).toBeVisible();
    await expect(page.getByRole("option", { exact: true, name: "blue-500" })).toHaveCount(0);

    const topSuggestionBox = await topSuggestion.boundingBox();
    if (!topSuggestionBox) {
      throw new Error("Expected visible ?top=sky-500 suggestion.");
    }

    await page.touchscreen.tap(
      topSuggestionBox.x + topSuggestionBox.width / 2,
      topSuggestionBox.y + topSuggestionBox.height / 2,
    );

    await expect(input).toHaveValue(`${prefix}logo?top=sky-500`);
    await expectInputSelection(input, `${prefix}logo?top=`.length);
    await expect(page.getByRole("option", { exact: true, name: "blue-500" })).toBeVisible();
  });

  test("touch scroll slate can apply the current preview row", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

    await input.press("End");

    await scrollTouchPickerToSuggestion(page, "?top=sky-500");

    const applyButton = page.getByTestId("route-url-editor-touch-apply");
    await expect(applyButton).toBeVisible();
    await expect(applyButton).toHaveAccessibleName("Apply ?top=sky-500");

    await applyButton.tap();

    await expect(input).toHaveValue(`${prefix}logo?top=sky-500`);
    await expectInputSelection(input, `${prefix}logo?top=`.length);
    await expect(page.getByRole("option", { exact: true, name: "blue-500" })).toBeVisible();
  });

  test("touch tap on numeric samples opens the value slot", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

    await input.press("End");

    const zoomSuggestion = await scrollTouchPickerToSuggestion(page, "?zoom=0.5");

    await expect(input).toHaveValue(`${prefix}logo?zoom=0.5`);
    await expectTouchSlateAlignedToSuggestion(page, "?zoom=0.5");
    await expectInputSelection(input, `${prefix}logo?`.length);
    await expect(page).toHaveURL(/\/logo\?zoom=0\.5$/);
    await expect(page.getByRole("option", { exact: true, name: "?zoom=0.5" })).toBeVisible();

    const zoomSuggestionBox = await zoomSuggestion.boundingBox();
    if (!zoomSuggestionBox) {
      throw new Error("Expected visible ?zoom=0.5 suggestion.");
    }

    await page.touchscreen.tap(
      zoomSuggestionBox.x + zoomSuggestionBox.width / 2,
      zoomSuggestionBox.y + zoomSuggestionBox.height / 2,
    );

    await expect(input).toHaveValue(`${prefix}logo?zoom=0.5`);
    await expectInputSelection(input, `${prefix}logo?zoom=`.length);
    await expect(page).toHaveURL(/\/logo\?zoom=0\.5$/);
    await expect(page.getByRole("option", { exact: true, name: "0.1" })).toBeVisible();
  });

  test("touch scroll keeps suggestions open when preview canonicalizes the route", async ({
    page,
  }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

    await input.press("End");
    await expect(page.getByRole("option", { exact: true, name: "?dark" })).toBeVisible();

    const darkSuggestion = await scrollTouchPickerToSuggestion(page, "?dark");
    const darkSuggestionBox = await darkSuggestion.boundingBox();
    if (!darkSuggestionBox) {
      throw new Error("Expected visible ?dark suggestion.");
    }

    await page.touchscreen.tap(
      darkSuggestionBox.x + darkSuggestionBox.width / 2,
      darkSuggestionBox.y + darkSuggestionBox.height / 2,
    );

    await expect(input).toHaveValue(`${prefix}logo?dark&`);
    await expect(page).toHaveURL(/\/logo\?dark$/);

    await scrollTouchPickerToSuggestion(page, "&light");

    await expect(input).toHaveValue(`${prefix}logo?dark&light&`);
    await expect(page).toHaveURL(/\/logo$/);
    await expect(page.getByRole("option", { exact: true, name: "&light" })).toBeVisible();
    await expect(input).toBeFocused();
  });

  test("touch scroll keeps suggestions open when previewing later logo params @logo-research", async ({
    page,
  }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo?depth=2");

    await expect(input).toHaveValue(`${prefix}logo?depth=2&`);
    await expect(
      page.getByRole("option", { exact: true, name: "&background=stone-50" }),
    ).toBeVisible();

    await scrollTouchPickerToSuggestion(page, "&background=stone-50");

    await expect(input).toHaveValue(`${prefix}logo?depth=2&background=stone-50`);
    await expect(page.getByTestId("route-url-editor-scroll-slate")).toBeVisible();
    await expect(
      page.getByRole("option", { exact: true, name: "&background=stone-50" }),
    ).toBeVisible();
    await expect(input).toBeFocused();
  });

  test("mobile editor can move selection from an appended query slot back into the path", async ({
    page,
  }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(
      page,
      "/terms?border=stone-300&dev&depth=2&gridSize=2&light",
    );

    const appendedQuerySlotValue = `${prefix}terms?border=stone-300&dev&depth=2&gridSize=2&light&`;
    await expect(input).toHaveValue(appendedQuerySlotValue);
    await input.press("End");
    await expectInputSelection(input, appendedQuerySlotValue.length);
    await expect(page.getByRole("option", { exact: true, name: "&dev" })).toHaveCount(0);
    await expect(page.getByRole("option", { exact: true, name: "&top=sky-500" })).toHaveCount(0);
    await expect(
      page.getByRole("option", { exact: true, name: "&background=stone-50" }),
    ).toBeVisible();

    await input.press("Home");

    await expect(page.getByRole("option", { exact: true, name: "/logo" })).toBeVisible();
    await expect(page.getByRole("option", { exact: true, name: "&dev" })).toHaveCount(0);
  });

  test("touch scroll hides already-present query keys while replacing another token", async ({
    page,
  }) => {
    const { input } = await focusRouteAddressInputDirectly(
      page,
      "/terms?border=stone-300&dev&depth=2&gridSize=2&light",
    );

    const inputBox = await input.boundingBox();
    if (!inputBox) {
      throw new Error("Expected visible route URL editor input.");
    }

    await input.tap({
      position: {
        x: 90,
        y: inputBox.height / 2,
      },
    });

    await expect(page.getByRole("option", { exact: true, name: "?dev" })).toHaveCount(0);
    await expect(page.getByRole("option", { exact: true, name: "?depth=2" })).toHaveCount(0);
    await expect(
      page.getByRole("option", { exact: true, name: "?border=stone-300" }),
    ).toBeVisible();
    await expect(input).toBeFocused();
  });

  test("touch editor keeps text editing in control while deleting a query key", async ({
    page,
  }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/terms?dev");

    await expect(input).toHaveValue(`${prefix}terms?dev&`);
    await expect(page.getByTestId("route-url-editor-scroll-slate")).toBeVisible();
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
    await input.press("End");

    await input.press("Backspace");
    await expect(input).toHaveValue(`${prefix}terms?dev`);

    await input.press("Backspace");
    await expect(input).toHaveValue(`${prefix}terms?de`);
    await expect(input).toBeFocused();
  });

  test("touch scroll path preview restores when tapping outside", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/terms");

    await input.press("Home");

    await scrollTouchPickerToSuggestion(page, "/logo");

    await expect(input).toHaveValue(`${prefix}logo?`);
    await expect(page).toHaveURL(/\/logo$/);

    await page.touchscreen.tap(20, 760);

    const nextDisplayInput = page.getByTestId("route-url-editor-display");
    await expect(nextDisplayInput).toHaveValue("/terms");
    await expect(page).toHaveURL(/\/terms$/);
  });

  test("touch scroll query preview restores when tapping outside", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

    await input.press("End");

    await scrollTouchPickerToSuggestion(page, "?top=sky-500");

    await expect(input).toHaveValue(`${prefix}logo?top=sky-500`);
    await expect(page).toHaveURL(/\/logo\?top=sky-500$/);

    await page.touchscreen.tap(20, 760);

    const nextDisplayInput = page.getByTestId("route-url-editor-display");
    await expect(nextDisplayInput).toHaveValue("/logo");
    await expect(page).toHaveURL(/\/logo$/);
  });

  test("touch scroll query preview does not remain in forward history", async ({ page }) => {
    await page.goto("/terms", {
      waitUntil: "domcontentloaded",
    });

    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

    await input.press("End");
    await scrollTouchPickerToSuggestion(page, "?top=sky-500");

    await expect(input).toHaveValue(`${prefix}logo?top=sky-500`);
    await expect(page).toHaveURL(/\/logo\?top=sky-500$/);

    await page.goBack();

    const termsDisplayInput = page.getByTestId("route-url-editor-display");
    await expect(termsDisplayInput).toHaveValue("/terms");
    await expect(page).toHaveURL(/\/terms$/);

    await page.goForward();

    const logoDisplayInput = page.getByTestId("route-url-editor-display");
    await expect(logoDisplayInput).toHaveValue("/logo");
    await expect(page).toHaveURL(/\/logo$/);
  });
});

test("route URL editor keeps the prefix visible when Backspace deletes a selection that crosses it", async ({
  page,
}) => {
  const { focusedInputValue, input, prefix } = await focusRouteAddressInput(page);

  const selectionEnd = prefix.length + 3;
  await setInputSelection(input, {
    end: selectionEnd,
    start: 5,
  });

  await expectNoPageErrorDuring(page, () => input.press("Backspace"));

  expect(focusedInputValue.slice(selectionEnd)).toBe("vacy?");
  await expect(input).toHaveValue(`${prefix}vacy?`);
  await expectInputSelection(input, prefix.length);
});

test("route URL editor ignores Backspace at the protected prefix boundary", async ({ page }) => {
  const { focusedInputValue, input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length,
    start: prefix.length,
  });

  await expectNoPageErrorDuring(page, () => input.press("Backspace"));

  await expect(input).toHaveValue(focusedInputValue);
  await expectInputSelection(input, prefix.length);
});

test("route URL editor keeps focus and advances the cursor after selecting suggestions", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await input.press("Home");
  await page.getByRole("option", { exact: true, name: "/logo" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?`);
  await expectInputSelection(input, `${prefix}logo?`.length);
  await expect(page).toHaveURL(/\/logo$/);
  await expect(page.getByRole("option", { exact: true, name: "?top=sky-500" })).toBeVisible();

  await page.getByRole("option", { exact: true, name: "?top=sky-500" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?top=sky-500`);
  await expectInputSelection(input, `${prefix}logo?top=`.length);
  await expect(page).toHaveURL(/\/logo\?top=sky-500$/);
  await expect(page.getByRole("option", { exact: true, name: "blue-500" })).toBeVisible();

  await page.getByRole("option", { exact: true, name: "blue-500" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?top=blue-500`);
  await expectInputSelection(input, `${prefix}logo?top=blue-`.length);
  await expect(page).toHaveURL(/\/logo\?top=blue-500$/);
  await expect(page.getByRole("option", { exact: true, name: "200" })).toBeVisible();

  await page.getByRole("option", { exact: true, name: "200" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?top=blue-200&`);
  await expectInputSelection(input, `${prefix}logo?top=blue-200&`.length);
  await expect(
    page.getByRole("option", { exact: true, name: "&secondary=rose-500" }),
  ).toBeVisible();
});

test("route URL editor keeps the cursor before a preserved hash after path selection", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms#top");

  await expect(input).toHaveValue(`${prefix}terms?#top`);

  await input.press("Home");
  await page.getByRole("option", { exact: true, name: "/logo" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?#top`);
  await expectInputSelection(input, `${prefix}logo?`.length);
  await expect(page).toHaveURL(/\/logo\??#top$/);
  await expect(page.getByRole("option", { exact: true, name: "?top=sky-500" })).toBeVisible();
});

test("route URL editor scrolls same-page hash destinations into view", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInputDirectly(page, "/landing-preview");

  await input.fill(`${prefix}landing-preview#landing-note-tokens`);

  await expect(page).toHaveURL(/\/landing-preview#landing-note-tokens$/);
  await expect(page.locator("#landing-note-tokens")).toBeInViewport();
  await expect
    .poll(() =>
      page
        .locator('[data-scroll-restoration-id="workspace-layout-v2-main"]')
        .evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(0);
});

test("route URL editor puts the cursor in the selected value slot for middle query tokens", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(
    page,
    "/logo?dark&depth=2&secondary=rose-500",
  );
  const depthCursor = `${prefix}logo?dark&de`.length;

  await setInputSelection(input, {
    end: depthCursor,
    start: depthCursor,
  });

  await input.press("ArrowRight");
  await input.press("ArrowLeft");

  const topOption = page.getByRole("option", { exact: true, name: "&top=sky-500" });
  await expect(topOption).toBeVisible();

  await topOption.click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?dark&top=sky-500&secondary=rose-500&`);
  await expectInputSelection(input, `${prefix}logo?dark&top=`.length);
  await expect(page.getByRole("option", { exact: true, name: "blue-500" })).toBeVisible();
});

test("route URL editor keeps numeric query samples editable after selection", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

  await input.press("End");

  const depthOption = page.getByRole("option", { exact: true, name: "?depth=2" });
  await expect(depthOption).toBeVisible();

  await depthOption.hover();

  await expect(input).toHaveValue(`${prefix}logo?depth=2`);
  await expect(page).toHaveURL(/\/logo\?depth=2$/);

  await depthOption.click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?depth=2`);
  await expectInputSelection(input, `${prefix}logo?depth=`.length);
  await expect(page).toHaveURL(/\/logo\?depth=2$/);
  await expect(page.getByRole("option", { exact: true, name: "1" })).toBeVisible();
});

test("route URL editor applies hover path suggestions and restores on mouseleave", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}terms?top=red-`));
  await expect(input).toHaveValue(`${prefix}terms?top=red-`);
  await expect(page).toHaveURL(/\/terms$/);

  await input.press("Home");

  const privacyOption = page.getByRole("option", { exact: true, name: "/privacy" });
  await expect(privacyOption).toBeVisible();

  await privacyOption.hover();

  await expect(input).toHaveValue(`${prefix}privacy?top=red-`);
  await expectInputSelection(input, prefix.length);
  await expect(page).toHaveURL(/\/privacy$/);
  await expectPrivacyPage(page);

  await page.mouse.move(0, 0);

  await expect(input).toHaveValue(`${prefix}terms?top=red-`);
  await expect(page).toHaveURL(/\/terms$/);
  await expectTermsPage(page);

  await privacyOption.hover();
  await privacyOption.click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}privacy?top=red-`);
  await expect(page).toHaveURL(/\/privacy$/);
  await expectPrivacyPage(page);

  await page.goBack();

  await expect(page.getByTestId("route-url-editor-display")).toHaveValue("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expectTermsPage(page);
});

test("route URL editor restores pointer path preview when clicking outside", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}terms?top=red-`));
  await input.press("Home");

  const privacyOption = page.getByRole("option", { exact: true, name: "/privacy" });
  await expect(privacyOption).toBeVisible();

  await privacyOption.hover();

  await expect(input).toHaveValue(`${prefix}privacy?top=red-`);
  await expect(page).toHaveURL(/\/privacy$/);

  await clickOutsideRouteUrlEditor(page);

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expectTermsPage(page);
});

test("route URL editor cancels pointer path preview when clicking back into the input", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}terms?top=red-`));
  await input.press("Home");

  const privacyOption = page.getByRole("option", { exact: true, name: "/privacy" });
  await expect(privacyOption).toBeVisible();

  await privacyOption.hover();

  await expect(input).toHaveValue(`${prefix}privacy?top=red-`);
  await expect(page).toHaveURL(/\/privacy$/);

  await input.click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}terms?top=red-`);
  await expect(page).toHaveURL(/\/terms$/);
  await expectTermsPage(page);
});

test("route URL editor keeps deletion in control after a query suggestion was previewed", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInputDirectly(page, "/terms?dev");

  await expect(input).toHaveValue(`${prefix}terms?dev&`);
  await input.press("End");
  await input.press("Backspace");
  await expect(input).toHaveValue(`${prefix}terms?dev`);

  await page.getByRole("option", { exact: true, name: "?dark" }).hover();
  await expect(input).toHaveValue(`${prefix}terms?dark&`);
  await expectInputSelection(input, `${prefix}terms?`.length);

  await input.press("End");
  await expect(input).toHaveValue(`${prefix}terms?dev`);
  await expectInputSelection(input, `${prefix}terms?dev`.length);

  await input.press("Backspace");
  await expect(input).toHaveValue(`${prefix}terms?de`);
});

test("route URL editor previews path suggestions from keyboard and restores on Escape", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}terms?top=red-`));
  await expect(page).toHaveURL(/\/terms$/);

  await input.press("Home");
  await pressArrowDownToSuggestion(page, input, "/privacy");

  await expect(input).toHaveValue(`${prefix}privacy?top=red-`);
  await expectInputSelection(input, prefix.length);
  await expect(page).toHaveURL(/\/privacy$/);
  await expectPrivacyPage(page);

  await input.press("Escape");

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expectTermsPage(page);
});

test("route URL editor restores keyboard path preview when clicking outside", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}terms?top=red-`));
  await input.press("Home");
  await pressArrowDownToSuggestion(page, input, "/privacy");

  await expect(input).toHaveValue(`${prefix}privacy?top=red-`);
  await expect(page).toHaveURL(/\/privacy$/);

  await clickOutsideRouteUrlEditor(page);

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expectTermsPage(page);
});

test("route URL editor blurs local drafts when the page underneath scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 420 });

  const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

  await input.press("End");
  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo?leftFace=s`));

  await expect(input).toHaveValue(`${prefix}logo?leftFace=s`);
  await expect(page).toHaveURL(/\/logo$/);
  await expect(page.getByTestId("route-url-editor-suggestions")).toBeVisible();

  await page.mouse.move(360, 380);
  await page.mouse.wheel(0, 240);

  await expect(input).toHaveCount(0);
  await expect(page.getByTestId("route-url-editor-suggestions")).toHaveCount(0);
  await expect(page.getByTestId("route-url-editor-display")).toHaveValue("/logo");
  await expect(page).toHaveURL(/\/logo$/);
});

test("route URL editor commits active keyboard suggestions with Enter", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}terms?top=red-`));
  await expect(page).toHaveURL(/\/terms$/);

  await input.press("Home");
  await pressArrowDownToSuggestion(page, input, "/privacy");
  await input.press("Enter");

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}privacy?top=red-`);
  await expectInputSelection(input, `${prefix}privacy?top=red-`.length);
  await expect(page).toHaveURL(/\/privacy$/);
  await expectPrivacyPage(page);
});

test("route URL editor keyboard suggestions keep sample text editable after Enter", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/logo");

  await input.press("End");
  await pressArrowDownToSuggestion(page, input, "?top=sky-500");

  await expect(input).toHaveValue(`${prefix}logo?top=sky-500`);
  await expectInputSelection(input, `${prefix}logo?`.length);
  await expect(page).toHaveURL(/\/logo\?top=sky-500$/);

  await input.press("Enter");

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?top=sky-500`);
  await expectInputSelection(input, `${prefix}logo?top=`.length);
  await expect(page).toHaveURL(/\/logo\?top=sky-500$/);
  await expect(page.getByRole("option", { exact: true, name: "blue-500" })).toBeVisible();

  await pressArrowDownToSuggestion(page, input, "blue-500");

  await expect(input).toHaveValue(`${prefix}logo?top=blue-500`);
  await expectInputSelection(input, `${prefix}logo?top=`.length);
  await expect(page).toHaveURL(/\/logo\?top=blue-500$/);

  await input.press("Enter");

  await expect(input).toHaveValue(`${prefix}logo?top=blue-500`);
  await expectInputSelection(input, `${prefix}logo?top=blue-`.length);
  await expect(page).toHaveURL(/\/logo\?top=blue-500$/);
  await expect(page.getByRole("option", { exact: true, name: "200" })).toBeVisible();
});

test("route URL editor applies route-ready typed drafts immediately", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}lo`));

  await expect(input).toHaveValue(`${prefix}lo`);
  await expect(page).toHaveURL(/\/privacy$/);

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo`));

  await expect(input).toHaveValue(`${prefix}logo`);
  await expect(page).toHaveURL(/\/logo$/);

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo?dar`));

  await expect(input).toHaveValue(`${prefix}logo?dar`);
  await expect(page).toHaveURL(/\/logo$/);

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo?dark`));

  await expect(input).toHaveValue(`${prefix}logo?dark`);
  await expect(page).toHaveURL(/\/logo\?dark$/);
});

test("route URL editor adds history when typing reaches a new path", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo`));

  await expect(input).toHaveValue(`${prefix}logo`);
  await expect(page).toHaveURL(/\/logo$/);

  await page.goBack();

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expectTermsPage(page);
});

test("route URL editor navigation buttons track typed history entries", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo`));

  const backButton = page.getByRole("button", { exact: true, name: "Back" });
  await expect(backButton).toBeEnabled();

  await backButton.click();

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue("/terms");
  await expect(page).toHaveURL(/\/terms$/);

  const forwardButton = page.getByRole("button", { exact: true, name: "Forward" });
  await expect(forwardButton).toBeEnabled();
});

test("route URL editor navigation buttons stay correct after hard refresh", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo`));

  const backButton = page.getByRole("button", { exact: true, name: "Back" });
  const forwardButton = page.getByRole("button", { exact: true, name: "Forward" });

  await expect(page).toHaveURL(/\/logo$/);
  await expect(backButton).toBeEnabled();
  await expect(forwardButton).toBeDisabled();

  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("route-url-editor-display")).toHaveValue("/logo");
  await expect(page).toHaveURL(/\/logo$/);
  await expect(backButton).toBeEnabled();
  await expect(forwardButton).toBeDisabled();

  await backButton.click();

  await expect(page.getByTestId("route-url-editor-display")).toHaveValue("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expect(backButton).toBeDisabled();
  await expect(forwardButton).toBeEnabled();

  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("route-url-editor-display")).toHaveValue("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expect(backButton).toBeDisabled();
  await expect(forwardButton).toBeEnabled();

  await forwardButton.click();

  await expect(page.getByTestId("route-url-editor-display")).toHaveValue("/logo");
  await expect(page).toHaveURL(/\/logo$/);
  await expect(backButton).toBeEnabled();
  await expect(forwardButton).toBeDisabled();
});

test("route URL editor adds history when typing reaches a new canonical query", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/logo?dark");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo?dark&light`));

  await expect(input).toHaveValue(`${prefix}logo?dark&light`);
  await expect(page).toHaveURL(/\/logo$/);

  await page.goBack();

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue("/logo?dark");
  await expect(page).toHaveURL(/\/logo\?dark$/);
});

test("route URL editor adds history when typing changes a query value", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo?depth=2");
  const depthValueEnd = `${prefix}logo?depth=2`.length;

  await setInputSelection(input, {
    end: depthValueEnd,
    start: depthValueEnd,
  });

  await input.press("Backspace");

  await expect(input).toHaveValue(`${prefix}logo?depth=&`);
  await expect(page).toHaveURL(/\/logo$/);

  await input.type("3");

  await expect(input).toHaveValue(`${prefix}logo?depth=3&`);
  await expect(page).toHaveURL(/\/logo\?depth=3$/);

  await page.goBack();

  const logoDisplayInput = page.getByTestId("route-url-editor-display");
  await expect(logoDisplayInput).toHaveValue("/logo");
  await expect(page).toHaveURL(/\/logo$/);

  await page.goBack();

  const depthDisplayInput = page.getByTestId("route-url-editor-display");
  await expect(depthDisplayInput).toHaveValue("/logo?depth=2");
  await expect(page).toHaveURL(/\/logo\?depth=2$/);
});

test("route URL editor adds history when typing adopts a suggestion preview", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms");

  await input.press("Home");
  await pressArrowDownToSuggestion(page, input, "/privacy");

  await expect(input).toHaveValue(`${prefix}privacy?`);
  await expect(page).toHaveURL(/\/privacy$/);

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo`));

  await expect(input).toHaveValue(`${prefix}logo`);
  await expect(page).toHaveURL(/\/logo$/);

  await page.goBack();

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expectTermsPage(page);
});

test("route URL editor restores suggestion previews before Refresh reloads", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}terms?top=red-`));
  await input.press("Home");
  await pressArrowDownToSuggestion(page, input, "/privacy");

  await expect(input).toHaveValue(`${prefix}privacy?top=red-`);
  await expect(page).toHaveURL(/\/privacy$/);

  await page.getByRole("button", { exact: true, name: "Refresh" }).click();
  await page.waitForLoadState("domcontentloaded");

  await expect(page.getByTestId("route-url-editor-display")).toHaveValue("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expectTermsPage(page);
});

test.describe("route URL editor public route query stories", () => {
  test("reset canonicalizes the browser route without closing the editor", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo?dark");

    await input.press("End");

    const resetOption = page.getByRole("option", { exact: true, name: "&reset" });
    await expect(resetOption).toBeVisible();

    await resetOption.click();

    await expect(input).toHaveValue(`${prefix}logo?dark&reset&`);
    await expect(page).toHaveURL(/\/logo$/);
    await expect(input).toBeFocused();
    await expect(page.getByRole("option", { exact: true, name: "&dark" })).toHaveCount(0);
    await expect(
      page.getByRole("option", { exact: true, name: "&background=stone-50" }),
    ).toBeVisible();

    await input.press("Escape");

    const displayInput = page.getByTestId("route-url-editor-display");
    await expect(displayInput).toHaveValue("/logo");
    await expect(page).toHaveURL(/\/logo$/);
  });

  test("unfinished numeric values stay local until the value is complete", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

    await input.press("End");
    await input.type("rot=");

    await expect(input).toHaveValue(`${prefix}logo?rot=`);
    await expect(page).toHaveURL(/\/logo$/);
    await expect(input).toBeFocused();

    await input.press("Backspace");

    await expect(input).toHaveValue(`${prefix}logo?rot`);
    await expect(page).toHaveURL(/\/logo$/);
    await expect(page.getByRole("option", { exact: true, name: "?rot=46" })).toBeVisible();
    await expect(input).toBeFocused();

    await input.type("=10");

    await expect(input).toHaveValue(`${prefix}logo?rot=10`);
    await expect(page).toHaveURL(/\/logo\?rot=10$/);
    await expect(input).toBeFocused();
  });

  test("unfinished numeric values normalize away when clicking outside", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

    await input.press("End");
    await input.type("rot=");

    await expect(input).toHaveValue(`${prefix}logo?rot=`);
    await expect(page).toHaveURL(/\/logo$/);

    await clickOutsideRouteUrlEditor(page);

    const displayInput = page.getByTestId("route-url-editor-display");
    await expect(displayInput).toHaveValue("/logo");
    await expect(page).toHaveURL(/\/logo$/);
  });

  test("deleting canonicalized numeric values keeps text editing in control", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

    await input.press("End");
    await input.type("zoom=0.01");

    await expect(input).toHaveValue(`${prefix}logo?zoom=0.01`);
    await expect(page).toHaveURL(/\/logo\?zoom=0\.01$/);
    await expect(input).toBeFocused();

    await input.press("Backspace");

    await expect(input).toHaveValue(`${prefix}logo?zoom=0.0`);
    await expect(page).toHaveURL(/\/logo\?zoom=0$/);
    await expect(input).toBeFocused();

    await page.goBack();

    const displayInput = page.getByTestId("route-url-editor-display");
    await expect(displayInput).toHaveValue("/logo?zoom=0.01");
    await expect(page).toHaveURL(/\/logo\?zoom=0\.01$/);
  });
});

test("route URL editor keeps Escape aligned with the last auto-applied route", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo`));
  await expect(page).toHaveURL(/\/logo$/);

  await input.press("Escape");

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue("/logo");
  await expect(page).toHaveURL(/\/logo$/);
});

test("route URL editor clears retained search when replacing the whole route draft", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page, "/terms?dev");

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo`));
  await expect(page).toHaveURL(/\/logo$/);

  await input.press("Escape");

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue("/logo");
  await expect(page).toHaveURL(/\/logo$/);
});

test("route URL editor ignores malformed DOM input instead of throwing", async ({ page }) => {
  const { focusedInputValue, input } = await focusRouteAddressInput(page);

  await expectNoPageErrorDuring(page, () =>
    dispatchRouteAddressInputValue(input, "not a valid absolute URL"),
  );

  await expect(input).toHaveValue(focusedInputValue);
});

test("route URL editor blurs and adopts an external route change while focused", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}lo`));
  await expect(input).toHaveValue(`${prefix}lo`);
  await expect(page).toHaveURL(/\/privacy$/);

  await expectNoPageErrorDuring(page, () => pushBrowserRoute(page, "/terms"));

  await expect(page).toHaveURL(/\/terms$/);
  await expect(input).toBeHidden();

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue("/terms");
  await expect(displayInput).not.toBeFocused();
});

test("route URL editor clamps modifier Backspace to the route boundary", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length + "privacy?".length,
    start: prefix.length + "privacy?".length,
  });

  await expectNoPageErrorDuring(page, () => input.press("ControlOrMeta+Backspace"));

  await expect(input).toHaveValue(prefix);
  await expectInputSelection(input, prefix.length);
});

test("route URL editor keeps the prefix visible when Delete removes a selection that crosses it", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length + 3,
    start: 5,
  });

  await expectNoPageErrorDuring(page, () => input.press("Delete"));

  await expect(input).toHaveValue(`${prefix}vacy?`);
  await expectInputSelection(input, prefix.length);
});

test("route URL editor cuts only route text when Cut crosses the prefix and preserves undo", async ({
  page,
}) => {
  const { focusedInputValue, input, prefix } = await focusRouteAddressInput(page);

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: await page.evaluate(() => window.location.origin),
  });
  const selectionStart = 5;
  const selectionEnd = prefix.length + 3;
  await setInputSelection(input, {
    end: selectionEnd,
    start: selectionStart,
  });

  await expectNoPageErrorDuring(page, () => input.press("ControlOrMeta+X"));

  await expect(input).toHaveValue(`${prefix}vacy?`);
  await expectInputSelection(input, prefix.length);
  await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toBe("pri");

  await expectNoPageErrorDuring(page, () => input.press("ControlOrMeta+Z"));

  await expect(input).toHaveValue(focusedInputValue);
  await expect(input).toHaveJSProperty("selectionStart", prefix.length);
  await expect(input).toHaveJSProperty("selectionEnd", selectionEnd);
});

test("route URL editor replaces only route text when typing over a selection that crosses the prefix", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await setInputSelection(input, {
    end: prefix.length + 3,
    start: 5,
  });

  await expectNoPageErrorDuring(page, () => input.press("x"));

  await expect(input).toHaveValue(`${prefix}xvacy?`);
  await expectInputSelection(input, prefix.length + 1);
});

test("route URL editor replaces only route text when pasting over a selection that crosses the prefix", async ({
  page,
}) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: await page.evaluate(() => window.location.origin),
  });
  await page.evaluate(() => navigator.clipboard.writeText("route"));
  await setInputSelection(input, {
    end: prefix.length + 3,
    start: 5,
  });

  await expectNoPageErrorDuring(page, () => input.press("ControlOrMeta+V"));

  await expect(input).toHaveValue(`${prefix}routevacy?`);
  await expectInputSelection(input, prefix.length + "route".length);
});
