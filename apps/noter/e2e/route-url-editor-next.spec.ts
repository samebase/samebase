import { expect, test, type Locator, type Page } from "@playwright/test";

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
    element.setSelectionRange(nextSelection.start, nextSelection.end);
  }, selection);
}

async function expectInputSelection(input: Locator, position: number): Promise<void> {
  await expect(input).toHaveJSProperty("selectionStart", position);
  await expect(input).toHaveJSProperty("selectionEnd", position);
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
  const initialRouteAddress = route.startsWith("/") ? route.slice(1) : route;
  const focusedInputValue = `${prefix}${initialRouteAddress}${
    initialRouteAddress === "" ? "" : initialRouteAddress.includes("?") ? "&" : "?"
  }`;

  await expect(displayInput).toHaveValue(`${prefix}${initialRouteAddress}`);
  const input = page.getByTestId("route-url-editor-input");
  for (let attempt = 0; attempt < 2; attempt += 1) {
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

  return {
    focusedInputValue,
    input,
    prefix,
  };
}

async function focusRouteAddressInputDirectly(page: Page, route = "/privacy") {
  const displayInput = await openRouteUrlEditor(page, route);
  const prefix = await readRouteAddressPrefix(page);
  const initialRouteAddress = route.startsWith("/") ? route.slice(1) : route;
  const focusedInputValue = `${prefix}${initialRouteAddress}${
    initialRouteAddress === "" ? "" : initialRouteAddress.includes("?") ? "&" : "?"
  }`;

  await expect(displayInput).toHaveValue(`${prefix}${initialRouteAddress}`);

  const input = page.getByTestId("route-url-editor-input");
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
  await page.getByRole("button", { name: "Toggle Right Sidebar" }).click();
}

async function pressArrowDownToSuggestion(
  page: Page,
  input: Locator,
  suggestionValue: string,
): Promise<Locator> {
  const suggestions = page.getByTestId("route-url-editor-suggestion");
  await expect(page.getByRole("option", { exact: true, name: suggestionValue })).toBeVisible();

  const suggestionValues = (await suggestions.allTextContents()).map((value) => value.trim());
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

  const suggestionValues = (await suggestions.allTextContents()).map((value) => value.trim());
  const suggestionIndex = suggestionValues.indexOf(suggestionValue);

  expect(suggestionIndex).toBeGreaterThanOrEqual(0);

  const rowHeight = await suggestions.first().evaluate((element) => {
    return element.getBoundingClientRect().height;
  });

  await scrollTouchPickerTo(page, suggestionIndex * rowHeight);

  return suggestions.nth(suggestionIndex);
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

  test("touch path suggestion lists use the same scroll picker", async ({ page }) => {
    const displayInput = await openRouteUrlEditor(page, "/");
    const prefix = await readRouteAddressPrefix(page);

    await expect(displayInput).toHaveValue(prefix);
    await displayInput.click();

    const input = page.getByTestId("route-url-editor-input");
    await expect(input).toHaveValue(prefix);
    await expect(page.getByTestId("route-url-editor-scroll-slate")).toBeVisible();
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);

    await scrollTouchPickerTo(page, 13);

    await expect(input).toHaveValue(prefix);
    await expect(page).toHaveURL(/\/$/);

    const logoSuggestion = await scrollTouchPickerToSuggestion(page, "/logo");

    await expect(input).toHaveValue(`${prefix}logo?`);
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
    await expect(page.getByRole("option", { exact: true, name: "?top=" })).toBeVisible();
  });

  test("touch scroll keeps query-key suggestions anchored until tap", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

    await input.press("End");
    await expect(page.getByRole("option", { exact: true, name: "?top=" })).toBeVisible();
    await expect(page.getByTestId("route-url-editor-scroll-slate")).toBeVisible();
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);

    const topSuggestion = await scrollTouchPickerToSuggestion(page, "?top=");

    await expect(input).toHaveValue(`${prefix}logo?top=`);
    await expect(page).toHaveURL(/\/logo$/);
    await expect(page.getByTestId("route-url-editor-scroll-slate")).toBeVisible();
    await expect(page.getByRole("option", { exact: true, name: "?top=" })).toBeVisible();
    await expect(page.getByRole("option", { exact: true, name: "blue-" })).toHaveCount(0);

    const topSuggestionBox = await topSuggestion.boundingBox();
    if (!topSuggestionBox) {
      throw new Error("Expected visible ?top= suggestion.");
    }

    await page.touchscreen.tap(
      topSuggestionBox.x + topSuggestionBox.width / 2,
      topSuggestionBox.y + topSuggestionBox.height / 2,
    );

    await expect(input).toHaveValue(`${prefix}logo?top=`);
    await expectInputSelection(input, `${prefix}logo?top=`.length);
    await expect(page.getByRole("option", { exact: true, name: "blue-" })).toBeVisible();
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

  test("touch scroll preview is kept when tapping outside", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/terms");

    await input.press("Home");

    await scrollTouchPickerToSuggestion(page, "/logo");

    await expect(input).toHaveValue(`${prefix}logo?`);
    await expect(page).toHaveURL(/\/logo$/);

    await page.touchscreen.tap(20, 760);

    const nextDisplayInput = page.getByTestId("route-url-editor-display");
    await expect(nextDisplayInput).toHaveValue(`${prefix}logo`);
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
  await expect(page.getByRole("option", { exact: true, name: "?top=" })).toBeVisible();

  await page.getByRole("option", { exact: true, name: "?top=" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?top=`);
  await expectInputSelection(input, `${prefix}logo?top=`.length);
  await expect(page.getByRole("option", { exact: true, name: "blue-" })).toBeVisible();

  await page.getByRole("option", { exact: true, name: "blue-" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?top=blue-`);
  await expectInputSelection(input, `${prefix}logo?top=blue-`.length);
  await expect(page.getByRole("option", { exact: true, name: "blue-200" })).toBeVisible();

  await page.getByRole("option", { exact: true, name: "blue-200" }).click();

  await expect(input).toBeFocused();
  await expect(input).toHaveValue(`${prefix}logo?top=blue-200&`);
  await expectInputSelection(input, `${prefix}logo?top=blue-200&`.length);
  await expect(page.getByRole("option", { exact: true, name: "&secondary=" })).toBeVisible();
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
  await expect(displayInput).toHaveValue(`${prefix}terms`);
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
  const displayInput = await openRouteUrlEditor(page, "/terms?dev");
  const prefix = await readRouteAddressPrefix(page);

  await expect(displayInput).toHaveValue(`${prefix}terms?dev`);
  await displayInput.click();

  const input = page.getByTestId("route-url-editor-input");
  await expect(input).toHaveValue(`${prefix}terms?dev&`);
  await input.press("End");
  await input.press("Backspace");
  await expect(input).toHaveValue(`${prefix}terms?dev`);

  await page.getByRole("option", { exact: true, name: "?dev" }).hover();
  await expect(input).toHaveValue(`${prefix}terms?dev&`);

  await input.press("Backspace");
  await expect(input).toHaveValue(`${prefix}terms?dev`);

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
  await expect(page).toHaveURL(/\/privacy$/);
  await expectPrivacyPage(page);

  await input.press("Escape");

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue(`${prefix}terms`);
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
  await expect(displayInput).toHaveValue(`${prefix}terms`);
  await expect(page).toHaveURL(/\/terms$/);
  await expectTermsPage(page);
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

test.describe("route URL editor public route query stories", () => {
  test("manual root auth params stay local and do not suggest OAuth values", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/");

    await input.type("?a");

    const authOption = page.getByRole("option", { exact: true, name: "?auth=" });
    await expect(authOption).toBeVisible();
    await expect(page.getByRole("option", { exact: true, name: "?auth=google" })).toHaveCount(0);

    await authOption.hover();

    await expect(input).toHaveValue(`${prefix}?auth=`);
    await expect(page).toHaveURL(/\/$/);
    await expect(input).toBeFocused();

    await input.fill(`${prefix}?auth=g`);

    await expect(page.getByRole("option")).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    await expect(input).toBeFocused();
  });

  test("devtools is hidden from query suggestions", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo");

    await input.press("End");
    await input.type("dev");

    await expect(input).toHaveValue(`${prefix}logo?dev`);
    await expect(page.getByRole("option", { exact: true, name: "?dev" })).toBeVisible();
    await expect(page.getByRole("option", { exact: true, name: "?devtools" })).toHaveCount(0);
  });

  test("reset canonicalizes the browser route without closing the editor", async ({ page }) => {
    const { input, prefix } = await focusRouteAddressInputDirectly(page, "/logo?dark");

    await input.press("End");

    const resetOption = page.getByRole("option", { exact: true, name: "&reset" });
    await expect(resetOption).toBeVisible();

    await resetOption.click();

    await expect(input).toHaveValue(`${prefix}logo?dark&reset&`);
    await expect(page).toHaveURL(/\/logo$/);
    await expect(input).toBeFocused();
    await expect(page.getByRole("option", { exact: true, name: "&dark" })).toBeVisible();

    await input.press("Escape");

    const displayInput = page.getByTestId("route-url-editor-display");
    await expect(displayInput).toHaveValue(`${prefix}logo`);
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
    await expect(page.getByRole("option", { exact: true, name: "?rot=" })).toBeVisible();
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
    await expect(displayInput).toHaveValue(`${prefix}logo`);
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
  });
});

test("route URL editor keeps Escape aligned with the last auto-applied route", async ({ page }) => {
  const { input, prefix } = await focusRouteAddressInput(page);

  await expectNoPageErrorDuring(page, () => input.fill(`${prefix}logo`));
  await expect(page).toHaveURL(/\/logo$/);

  await input.press("Escape");

  const displayInput = page.getByTestId("route-url-editor-display");
  await expect(displayInput).toHaveValue(`${prefix}logo`);
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
  await expect(displayInput).toHaveValue(`${prefix}logo`);
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
  await expect(displayInput).toHaveValue(`${prefix}terms`);
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
